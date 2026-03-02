import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import staticPlugin from '@fastify/static'
import { DateTime } from 'luxon'
import { config, paths } from './config.js'
import { buildMonthlyAnalysis, buildWeeklyAnalysis, resolveMonth, resolveWeek } from './analysis.js'
import { createDb, hasSessionOverlap, seedAdminUser, seedDefaultBoards } from './db.js'
import { verifyPassword } from './password.js'

const SESSION_COOKIE = config.sessionCookieName
const SLEEP_TYPES = new Set(['night', 'nap', 'fragmented'])

function nowUtcIso() {
  return DateTime.utc().toISO({ suppressMilliseconds: true })
}

function boardDto(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function sessionDto(row) {
  return {
    id: row.id,
    boardId: row.board_id,
    type: row.type,
    startAt: row.start_at,
    endAt: row.end_at,
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function parseTimeInput(value, fieldName) {
  if (!value || typeof value !== 'string') {
    throw new Error(`${fieldName} 不能为空`)
  }

  const dt = DateTime.fromISO(value, { setZone: true })
  if (!dt.isValid) {
    throw new Error(`${fieldName} 时间格式无效`)
  }

  return dt.toUTC().toISO({ suppressMilliseconds: true })
}

function parseOptionalTimeInput(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return parseTimeInput(value, fieldName)
}

function normalizeType(type) {
  if (!SLEEP_TYPES.has(type)) {
    throw new Error('type 仅支持 night、nap、fragmented')
  }
  return type
}

function cleanNote(note) {
  if (note === null || note === undefined) {
    return ''
  }

  return String(note).trim()
}

function validateRange(startAt, endAt) {
  if (!endAt) {
    return
  }

  if (endAt <= startAt) {
    throw new Error('结束时间必须晚于开始时间')
  }
}

const db = createDb()
const seededAdmin = seedAdminUser(db)
const seededBoards = seedDefaultBoards(db)

const app = fastify({ logger: true })

if (seededAdmin) {
  app.log.warn(
    `初始化管理员账号: ${seededAdmin.username} / ${seededAdmin.password}，请上线前立即修改密码`
  )
}
if (seededBoards.length > 0) {
  app.log.info(`已创建默认 Board: ${seededBoards.join(', ')}`)
}

await app.register(cookie, { secret: config.appSecret })

await app.register(cors, {
  credentials: true,
  origin(origin, callback) {
    if (!origin || config.allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }
    callback(null, false)
  }
})

function createSession(userId) {
  const token = randomBytes(32).toString('hex')
  const createdAt = nowUtcIso()
  const expiresAt = DateTime.utc()
    .plus({ days: config.sessionTtlDays })
    .toISO({ suppressMilliseconds: true })

  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    expiresAt,
    createdAt
  )

  return { token, expiresAt }
}

function removeSession(token) {
  if (!token) {
    return
  }
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

function setSessionCookie(reply, token, expiresAt) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    expires: DateTime.fromISO(expiresAt, { zone: 'utc' }).toJSDate()
  })
}

function clearSessionCookie(reply) {
  reply.clearCookie(SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction
  })
}

function getSessionUser(token) {
  if (!token) {
    return null
  }

  const now = nowUtcIso()
  return db
    .prepare(
      `
      SELECT u.id, u.username
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
        AND s.expires_at > ?
      LIMIT 1
    `
    )
    .get(token, now)
}

async function requireAuth(request, reply) {
  const token = request.cookies[SESSION_COOKIE]
  const user = getSessionUser(token)

  if (!user) {
    clearSessionCookie(reply)
    reply.code(401).send({ message: '未登录或登录已过期' })
    return
  }

  request.user = user
}

function findBoard(boardId) {
  return db.prepare('SELECT * FROM boards WHERE id = ? LIMIT 1').get(boardId)
}

app.get('/api/health', async () => ({ ok: true }))

app.post('/api/auth/login', async (request, reply) => {
  const { username, password } = request.body || {}

  if (!username || !password) {
    reply.code(400).send({ message: '请填写用户名和密码' })
    return
  }

  const user = db
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1')
    .get(String(username).trim())

  if (!user || !verifyPassword(String(password), user.password_hash)) {
    reply.code(401).send({ message: '用户名或密码错误' })
    return
  }

  const session = createSession(user.id)
  setSessionCookie(reply, session.token, session.expiresAt)

  reply.send({
    user: {
      id: user.id,
      username: user.username
    }
  })
})

app.post('/api/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
  const token = request.cookies[SESSION_COOKIE]
  removeSession(token)
  clearSessionCookie(reply)
  reply.send({ ok: true })
})

app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
  return {
    user: {
      id: request.user.id,
      username: request.user.username
    }
  }
})

app.get('/api/boards', { preHandler: requireAuth }, async () => {
  const rows = db.prepare('SELECT * FROM boards ORDER BY updated_at DESC, id DESC').all()
  return {
    boards: rows.map(boardDto)
  }
})

app.get('/api/boards/:id', { preHandler: requireAuth }, async (request, reply) => {
  const boardId = Number(request.params.id)
  const board = findBoard(boardId)

  if (!board) {
    reply.code(404).send({ message: 'Board 不存在' })
    return
  }

  reply.send({ board: boardDto(board) })
})

app.post('/api/boards', { preHandler: requireAuth }, async (request, reply) => {
  const name = String(request.body?.name || '').trim()
  const description = String(request.body?.description || '').trim()

  if (!name) {
    reply.code(400).send({ message: 'Board 名称不能为空' })
    return
  }

  const now = nowUtcIso()
  const result = db
    .prepare('INSERT INTO boards (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(name, description, now, now)

  const board = findBoard(Number(result.lastInsertRowid))
  reply.code(201).send({ board: boardDto(board) })
})

app.patch('/api/boards/:id', { preHandler: requireAuth }, async (request, reply) => {
  const boardId = Number(request.params.id)
  const board = findBoard(boardId)

  if (!board) {
    reply.code(404).send({ message: 'Board 不存在' })
    return
  }

  const name = request.body?.name === undefined ? board.name : String(request.body.name).trim()
  const description =
    request.body?.description === undefined ? board.description || '' : String(request.body.description).trim()

  if (!name) {
    reply.code(400).send({ message: 'Board 名称不能为空' })
    return
  }

  const now = nowUtcIso()
  db.prepare('UPDATE boards SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(
    name,
    description,
    now,
    boardId
  )

  const updated = findBoard(boardId)
  reply.send({ board: boardDto(updated) })
})

app.delete('/api/boards/:id', { preHandler: requireAuth }, async (request, reply) => {
  const boardId = Number(request.params.id)
  const board = findBoard(boardId)

  if (!board) {
    reply.code(404).send({ message: 'Board 不存在' })
    return
  }

  db.prepare('DELETE FROM boards WHERE id = ?').run(boardId)
  reply.send({ ok: true })
})

app.get('/api/boards/:id/sessions', { preHandler: requireAuth }, async (request, reply) => {
  const boardId = Number(request.params.id)
  const board = findBoard(boardId)

  if (!board) {
    reply.code(404).send({ message: 'Board 不存在' })
    return
  }

  const type = request.query?.type
  const limit = Math.min(Math.max(Number(request.query?.limit || 120), 1), 500)
  const params = [boardId]
  let sql = 'SELECT * FROM sleep_sessions WHERE board_id = ?'

  if (type && type !== 'all') {
    if (!SLEEP_TYPES.has(type)) {
      reply.code(400).send({ message: '筛选类型无效' })
      return
    }
    sql += ' AND type = ?'
    params.push(type)
  }

  sql += ' ORDER BY start_at DESC LIMIT ?'
  params.push(limit)

  const rows = db.prepare(sql).all(...params)
  reply.send({
    sessions: rows.map(sessionDto)
  })
})

app.post('/api/boards/:id/sessions', { preHandler: requireAuth }, async (request, reply) => {
  const boardId = Number(request.params.id)
  const board = findBoard(boardId)

  if (!board) {
    reply.code(404).send({ message: 'Board 不存在' })
    return
  }

  try {
    const type = normalizeType(request.body?.type)
    const startAt = parseTimeInput(request.body?.startAt, 'startAt')
    const endAt = parseOptionalTimeInput(request.body?.endAt, 'endAt')
    const note = cleanNote(request.body?.note)

    validateRange(startAt, endAt)

    if (hasSessionOverlap(db, boardId, startAt, endAt)) {
      reply.code(409).send({ message: '该时间段与已有记录重叠，请调整时间' })
      return
    }

    const now = nowUtcIso()
    const result = db
      .prepare(
        `
        INSERT INTO sleep_sessions (board_id, type, start_at, end_at, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(boardId, type, startAt, endAt, note, now, now)

    db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, boardId)

    const created = db.prepare('SELECT * FROM sleep_sessions WHERE id = ?').get(Number(result.lastInsertRowid))
    reply.code(201).send({ session: sessionDto(created) })
  } catch (error) {
    reply.code(400).send({ message: error.message || '参数错误' })
  }
})

app.patch('/api/sessions/:id', { preHandler: requireAuth }, async (request, reply) => {
  const sessionId = Number(request.params.id)
  const existing = db.prepare('SELECT * FROM sleep_sessions WHERE id = ?').get(sessionId)

  if (!existing) {
    reply.code(404).send({ message: '记录不存在' })
    return
  }

  try {
    const type =
      request.body?.type === undefined ? existing.type : normalizeType(request.body?.type)
    const startAt =
      request.body?.startAt === undefined
        ? existing.start_at
        : parseTimeInput(request.body?.startAt, 'startAt')
    const endAt =
      request.body?.endAt === undefined
        ? existing.end_at
        : parseOptionalTimeInput(request.body?.endAt, 'endAt')
    const note = request.body?.note === undefined ? existing.note || '' : cleanNote(request.body?.note)

    validateRange(startAt, endAt)

    if (hasSessionOverlap(db, existing.board_id, startAt, endAt, sessionId)) {
      reply.code(409).send({ message: '该时间段与已有记录重叠，请调整时间' })
      return
    }

    const now = nowUtcIso()
    db.prepare(
      `
      UPDATE sleep_sessions
      SET type = ?, start_at = ?, end_at = ?, note = ?, updated_at = ?
      WHERE id = ?
    `
    ).run(type, startAt, endAt, note, now, sessionId)

    db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, existing.board_id)

    const updated = db.prepare('SELECT * FROM sleep_sessions WHERE id = ?').get(sessionId)
    reply.send({ session: sessionDto(updated) })
  } catch (error) {
    reply.code(400).send({ message: error.message || '参数错误' })
  }
})

app.delete('/api/sessions/:id', { preHandler: requireAuth }, async (request, reply) => {
  const sessionId = Number(request.params.id)
  const existing = db.prepare('SELECT * FROM sleep_sessions WHERE id = ?').get(sessionId)

  if (!existing) {
    reply.code(404).send({ message: '记录不存在' })
    return
  }

  db.prepare('DELETE FROM sleep_sessions WHERE id = ?').run(sessionId)
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(nowUtcIso(), existing.board_id)
  reply.send({ ok: true })
})

app.get('/api/boards/:id/analysis/weekly', { preHandler: requireAuth }, async (request, reply) => {
  const boardId = Number(request.params.id)
  const board = findBoard(boardId)

  if (!board) {
    reply.code(404).send({ message: 'Board 不存在' })
    return
  }

  const timezone = String(request.query?.tz || config.defaultTimezone)

  try {
    const weekRange = resolveWeek(request.query?.week, timezone)
    const rows = db
      .prepare(
        `
        SELECT type, start_at, end_at
        FROM sleep_sessions
        WHERE board_id = ?
          AND end_at >= ?
          AND end_at < ?
        ORDER BY end_at ASC
      `
      )
      .all(boardId, weekRange.startUtc, weekRange.endUtc)

    const analysis = buildWeeklyAnalysis(rows, weekRange, timezone)
    reply.send({
      board: boardDto(board),
      analysis
    })
  } catch (error) {
    reply.code(400).send({ message: error.message || '分析参数无效' })
  }
})

app.get('/api/boards/:id/analysis/monthly', { preHandler: requireAuth }, async (request, reply) => {
  const boardId = Number(request.params.id)
  const board = findBoard(boardId)

  if (!board) {
    reply.code(404).send({ message: 'Board 不存在' })
    return
  }

  const timezone = String(request.query?.tz || config.defaultTimezone)

  try {
    const monthRange = resolveMonth(request.query?.month, timezone)
    const rows = db
      .prepare(
        `
        SELECT type, start_at, end_at
        FROM sleep_sessions
        WHERE board_id = ?
          AND end_at >= ?
          AND end_at < ?
        ORDER BY end_at ASC
      `
      )
      .all(boardId, monthRange.startUtc, monthRange.endUtc)

    const analysis = buildMonthlyAnalysis(rows, monthRange, timezone)
    reply.send({
      board: boardDto(board),
      analysis
    })
  } catch (error) {
    reply.code(400).send({ message: error.message || '分析参数无效' })
  }
})

if (fs.existsSync(paths.webDist)) {
  await app.register(staticPlugin, {
    root: paths.webDist,
    prefix: '/'
  })

  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith('/api/')) {
      reply.code(404).send({ message: '接口不存在' })
      return
    }
    reply.sendFile('index.html')
  })
} else {
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith('/api/')) {
      reply.code(404).send({ message: '接口不存在' })
      return
    }
    reply.code(404).send({ message: '前端资源未构建，请先执行 npm run build' })
  })
}

try {
  await app.listen({
    host: '0.0.0.0',
    port: config.appPort
  })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    try {
      await app.close()
    } finally {
      db.close()
      process.exit(0)
    }
  })
}
