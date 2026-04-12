import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import staticPlugin from '@fastify/static'
import { DateTime } from 'luxon'
import {
  authResponseSchema,
  boardResponseSchema,
  boardsResponseSchema,
  createBoardBodySchema,
  createSessionBodySchema,
  errorResponseSchema,
  idParamsSchema,
  listSessionsQuerySchema,
  loginBodySchema,
  monthlyAnalysisQuerySchema,
  monthlyAnalysisResponseSchema,
  okResponseSchema,
  sessionResponseSchema,
  sessionsResponseSchema,
  updateBoardBodySchema,
  updateSessionBodySchema,
  weeklyAnalysisQuerySchema,
  weeklyAnalysisResponseSchema
} from '../../shared/index.js'
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
    birthDate: row.birth_date || null,
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

function parseTimeInput(value, fieldName, timezone = config.defaultTimezone) {
  if (!value || typeof value !== 'string') {
    throw new Error(`${fieldName} 不能为空`)
  }

  const raw = value.trim()
  const zoneNow = DateTime.now().setZone(timezone)
  if (!zoneNow.isValid) {
    throw new Error('timezone 参数无效，请传入 IANA 格式时区，例如 Asia/Shanghai')
  }

  const hasExplicitZone = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(raw)
  const dt = hasExplicitZone ? DateTime.fromISO(raw, { setZone: true }) : DateTime.fromISO(raw, { zone: timezone })
  if (!dt.isValid) {
    throw new Error(`${fieldName} 时间格式无效`)
  }

  return dt.toUTC().toISO({ suppressMilliseconds: true })
}

function parseOptionalTimeInput(value, fieldName, timezone = config.defaultTimezone) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return parseTimeInput(value, fieldName, timezone)
}

function parseBirthDateInput(value) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const raw = String(value).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('birthDate 格式必须为 YYYY-MM-DD')
  }

  const dt = DateTime.fromISO(raw, { zone: 'utc' })
  if (!dt.isValid || dt.toISODate() !== raw) {
    throw new Error('birthDate 日期无效')
  }

  if (dt > DateTime.utc().startOf('day')) {
    throw new Error('birthDate 不能晚于今天')
  }

  return raw
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

const FIELD_LABELS = {
  username: '用户名',
  password: '密码',
  name: 'Board 名称',
  description: '描述',
  birthDate: 'birthDate',
  type: 'type',
  startAt: 'startAt',
  endAt: 'endAt',
  note: 'note',
  timezone: 'timezone',
  id: 'id',
  page: 'page',
  pageSize: 'pageSize',
  limit: 'limit',
  week: 'week',
  month: 'month',
  tz: 'tz'
}

function fieldLabel(path) {
  const target = path[path.length - 1]
  if (typeof target === 'string' && FIELD_LABELS[target]) {
    return FIELD_LABELS[target]
  }

  return '请求参数'
}

function formatValidationError(error, fallbackMessage = '参数错误') {
  const issue = error.issues?.[0]
  if (!issue) {
    return fallbackMessage
  }

  if (issue.code === 'unrecognized_keys' && issue.keys?.length) {
    return `包含不支持的字段：${issue.keys.join('、')}`
  }

  const label = fieldLabel(issue.path || [])

  if (issue.code === 'invalid_type') {
    return `${label} 参数类型无效`
  }

  if (issue.code === 'too_small' && issue.origin === 'string') {
    return `${label} 不能为空`
  }

  if (issue.code === 'too_small' && issue.origin === 'number') {
    return `${label} 参数无效`
  }

  if (issue.code === 'invalid_value') {
    if (label === 'type') {
      return 'type 仅支持 night、nap、fragmented'
    }

    return `${label} 参数无效`
  }

  if (issue.code === 'invalid_format') {
    if (label === 'birthDate') {
      return 'birthDate 格式必须为 YYYY-MM-DD'
    }

    if (label === 'week') {
      return 'week 参数格式必须为 YYYY-Www'
    }

    if (label === 'month') {
      return 'month 参数格式必须为 YYYY-MM'
    }

    return `${label} 格式无效`
  }

  if (issue.code === 'custom') {
    if (label === 'timezone' || label === 'tz') {
      return '无效时区，请传入 IANA 格式时区，例如 Asia/Shanghai'
    }

    return issue.message || fallbackMessage
  }

  return issue.message || fallbackMessage
}

function parseInput(reply, schema, value, fallbackMessage) {
  const result = schema.safeParse(value)
  if (!result.success) {
    sendError(reply, 400, formatValidationError(result.error, fallbackMessage))
    return null
  }

  return result.data
}

function sendError(reply, statusCode, message) {
  return reply.code(statusCode).send(errorResponseSchema.parse({ message }))
}

function sendValidated(reply, schema, payload, statusCode = 200) {
  return reply.code(statusCode).send(schema.parse(payload))
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
    sendError(reply, 401, '未登录或登录已过期')
    return
  }

  request.user = user
}

function findBoard(boardId) {
  return db.prepare('SELECT * FROM boards WHERE id = ? LIMIT 1').get(boardId)
}

app.get('/api/health', async () => okResponseSchema.parse({ ok: true }))

app.post('/api/auth/login', async (request, reply) => {
  const body = parseInput(reply, loginBodySchema, request.body || {}, '请填写用户名和密码')
  if (!body) {
    return
  }

  const user = db
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1')
    .get(body.username)

  if (!user || !verifyPassword(body.password, user.password_hash)) {
    sendError(reply, 401, '用户名或密码错误')
    return
  }

  const session = createSession(user.id)
  setSessionCookie(reply, session.token, session.expiresAt)

  sendValidated(reply, authResponseSchema, {
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
  sendValidated(reply, okResponseSchema, { ok: true })
})

app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
  return authResponseSchema.parse({
    user: {
      id: request.user.id,
      username: request.user.username
    }
  })
})

app.get('/api/boards', { preHandler: requireAuth }, async () => {
  const rows = db.prepare('SELECT * FROM boards ORDER BY updated_at DESC, id DESC').all()
  return boardsResponseSchema.parse({
    boards: rows.map(boardDto)
  })
})

app.get('/api/boards/:id', { preHandler: requireAuth }, async (request, reply) => {
  const params = parseInput(reply, idParamsSchema, request.params || {}, 'id 参数无效')
  if (!params) {
    return
  }

  const boardId = params.id
  const board = findBoard(boardId)

  if (!board) {
    sendError(reply, 404, 'Board 不存在')
    return
  }

  sendValidated(reply, boardResponseSchema, { board: boardDto(board) })
})

app.post('/api/boards', { preHandler: requireAuth }, async (request, reply) => {
  const body = parseInput(reply, createBoardBodySchema, request.body || {}, 'Board 参数错误')
  if (!body) {
    return
  }

  const { name, description } = body
  let birthDate

  try {
    birthDate = parseBirthDateInput(body.birthDate)
  } catch (error) {
    sendError(reply, 400, error.message || 'birthDate 参数错误')
    return
  }

  const now = nowUtcIso()
  const result = db
    .prepare('INSERT INTO boards (name, description, birth_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, description, birthDate, now, now)

  const board = findBoard(Number(result.lastInsertRowid))
  sendValidated(reply, boardResponseSchema, { board: boardDto(board) }, 201)
})

app.patch('/api/boards/:id', { preHandler: requireAuth }, async (request, reply) => {
  const params = parseInput(reply, idParamsSchema, request.params || {}, 'id 参数无效')
  const body = parseInput(reply, updateBoardBodySchema, request.body || {}, 'Board 参数错误')
  if (!params || !body) {
    return
  }

  const boardId = params.id
  const board = findBoard(boardId)

  if (!board) {
    sendError(reply, 404, 'Board 不存在')
    return
  }

  const name = body.name === undefined ? board.name : body.name
  const description = body.description === undefined ? board.description || '' : body.description
  let birthDate = board.birth_date || null

  if (body.birthDate !== undefined) {
    try {
      birthDate = parseBirthDateInput(body.birthDate)
    } catch (error) {
      sendError(reply, 400, error.message || 'birthDate 参数错误')
      return
    }
  }

  const now = nowUtcIso()
  db.prepare('UPDATE boards SET name = ?, description = ?, birth_date = ?, updated_at = ? WHERE id = ?').run(
    name,
    description,
    birthDate,
    now,
    boardId
  )

  const updated = findBoard(boardId)
  sendValidated(reply, boardResponseSchema, { board: boardDto(updated) })
})

app.delete('/api/boards/:id', { preHandler: requireAuth }, async (request, reply) => {
  const params = parseInput(reply, idParamsSchema, request.params || {}, 'id 参数无效')
  if (!params) {
    return
  }

  const boardId = params.id
  const board = findBoard(boardId)

  if (!board) {
    sendError(reply, 404, 'Board 不存在')
    return
  }

  db.prepare('DELETE FROM boards WHERE id = ?').run(boardId)
  sendValidated(reply, okResponseSchema, { ok: true })
})

app.get('/api/boards/:id/sessions', { preHandler: requireAuth }, async (request, reply) => {
  const paramsInput = parseInput(reply, idParamsSchema, request.params || {}, 'id 参数无效')
  const query = parseInput(reply, listSessionsQuerySchema, request.query || {}, '查询参数无效')
  if (!paramsInput || !query) {
    return
  }

  const boardId = paramsInput.id
  const board = findBoard(boardId)

  if (!board) {
    sendError(reply, 404, 'Board 不存在')
    return
  }

  const { type, page } = query
  const pageSize = Math.min(query.pageSize, 200)
  const params = [boardId]
  let whereClause = 'WHERE board_id = ?'

  if (type !== 'all') {
    whereClause += ' AND type = ?'
    params.push(type)
  }

  const countRow = db.prepare(`SELECT COUNT(*) AS total FROM sleep_sessions ${whereClause}`).get(...params)
  const total = Number(countRow?.total || 0)
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize)
  const currentPage = Math.min(page, totalPages)
  const offset = (currentPage - 1) * pageSize

  const rows = db
    .prepare(
      `
      SELECT * FROM sleep_sessions
      ${whereClause}
      ORDER BY start_at DESC, id DESC
      LIMIT ? OFFSET ?
    `
    )
    .all(...params, pageSize, offset)

  sendValidated(reply, sessionsResponseSchema, {
    sessions: rows.map(sessionDto),
    pagination: {
      page: currentPage,
      pageSize,
      total,
      totalPages,
      hasPrev: currentPage > 1,
      hasNext: currentPage < totalPages
    }
  })
})

app.post('/api/boards/:id/sessions', { preHandler: requireAuth }, async (request, reply) => {
  const params = parseInput(reply, idParamsSchema, request.params || {}, 'id 参数无效')
  const body = parseInput(reply, createSessionBodySchema, request.body || {}, '记录参数错误')
  if (!params || !body) {
    return
  }

  const boardId = params.id
  const board = findBoard(boardId)

  if (!board) {
    sendError(reply, 404, 'Board 不存在')
    return
  }

  try {
    const timezone = body.timezone || config.defaultTimezone
    const type = normalizeType(body.type)
    const startAt = parseTimeInput(body.startAt, 'startAt', timezone)
    const endAt = parseOptionalTimeInput(body.endAt, 'endAt', timezone)
    const note = cleanNote(body.note)

    validateRange(startAt, endAt)

    if (hasSessionOverlap(db, boardId, startAt, endAt)) {
      sendError(reply, 409, '该时间段与已有记录重叠，请调整时间')
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
    sendValidated(reply, sessionResponseSchema, { session: sessionDto(created) }, 201)
  } catch (error) {
    sendError(reply, 400, error.message || '参数错误')
  }
})

app.patch('/api/sessions/:id', { preHandler: requireAuth }, async (request, reply) => {
  const params = parseInput(reply, idParamsSchema, request.params || {}, 'id 参数无效')
  const body = parseInput(reply, updateSessionBodySchema, request.body || {}, '记录参数错误')
  if (!params || !body) {
    return
  }

  const sessionId = params.id
  const existing = db.prepare('SELECT * FROM sleep_sessions WHERE id = ?').get(sessionId)

  if (!existing) {
    sendError(reply, 404, '记录不存在')
    return
  }

  try {
    const timezone = body.timezone || config.defaultTimezone
    const type = body.type === undefined ? existing.type : normalizeType(body.type)
    const startAt =
      body.startAt === undefined
        ? existing.start_at
        : parseTimeInput(body.startAt, 'startAt', timezone)
    const endAt =
      body.endAt === undefined
        ? existing.end_at
        : parseOptionalTimeInput(body.endAt, 'endAt', timezone)
    const note = body.note === undefined ? existing.note || '' : cleanNote(body.note)

    validateRange(startAt, endAt)

    if (hasSessionOverlap(db, existing.board_id, startAt, endAt, sessionId)) {
      sendError(reply, 409, '该时间段与已有记录重叠，请调整时间')
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
    sendValidated(reply, sessionResponseSchema, { session: sessionDto(updated) })
  } catch (error) {
    sendError(reply, 400, error.message || '参数错误')
  }
})

app.delete('/api/sessions/:id', { preHandler: requireAuth }, async (request, reply) => {
  const params = parseInput(reply, idParamsSchema, request.params || {}, 'id 参数无效')
  if (!params) {
    return
  }

  const sessionId = params.id
  const existing = db.prepare('SELECT * FROM sleep_sessions WHERE id = ?').get(sessionId)

  if (!existing) {
    sendError(reply, 404, '记录不存在')
    return
  }

  db.prepare('DELETE FROM sleep_sessions WHERE id = ?').run(sessionId)
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(nowUtcIso(), existing.board_id)
  sendValidated(reply, okResponseSchema, { ok: true })
})

app.get('/api/boards/:id/analysis/weekly', { preHandler: requireAuth }, async (request, reply) => {
  const params = parseInput(reply, idParamsSchema, request.params || {}, 'id 参数无效')
  const query = parseInput(reply, weeklyAnalysisQuerySchema, request.query || {}, '分析参数无效')
  if (!params || !query) {
    return
  }

  const boardId = params.id
  const board = findBoard(boardId)

  if (!board) {
    sendError(reply, 404, 'Board 不存在')
    return
  }

  const timezone = query.tz || config.defaultTimezone

  try {
    const weekRange = resolveWeek(query.week, timezone)
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

    const baseAnalysis = buildWeeklyAnalysis(rows, weekRange, timezone, {
      boardBirthDate: board.birth_date || null
    })

    const sourceRecords = rows.map((row) => ({
      type: row.type,
      startAt: row.start_at,
      endAt: row.end_at
    }))

    sendValidated(reply, weeklyAnalysisResponseSchema, {
      board: boardDto(board),
      analysis: {
        ...baseAnalysis,
        sourceRecords
      }
    })
  } catch (error) {
    sendError(reply, 400, error.message || '分析参数无效')
  }
})

app.get('/api/boards/:id/analysis/monthly', { preHandler: requireAuth }, async (request, reply) => {
  const params = parseInput(reply, idParamsSchema, request.params || {}, 'id 参数无效')
  const query = parseInput(reply, monthlyAnalysisQuerySchema, request.query || {}, '分析参数无效')
  if (!params || !query) {
    return
  }

  const boardId = params.id
  const board = findBoard(boardId)

  if (!board) {
    sendError(reply, 404, 'Board 不存在')
    return
  }

  const timezone = query.tz || config.defaultTimezone

  try {
    const monthRange = resolveMonth(query.month, timezone)
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

    const baseAnalysis = buildMonthlyAnalysis(rows, monthRange, timezone, {
      boardBirthDate: board.birth_date || null
    })

    const sourceRecords = rows.map((row) => ({
      type: row.type,
      startAt: row.start_at,
      endAt: row.end_at
    }))

    sendValidated(reply, monthlyAnalysisResponseSchema, {
      board: boardDto(board),
      analysis: {
        ...baseAnalysis,
        sourceRecords
      }
    })
  } catch (error) {
    sendError(reply, 400, error.message || '分析参数无效')
  }
})

if (fs.existsSync(paths.webDist)) {
  await app.register(staticPlugin, {
    root: paths.webDist,
    prefix: '/'
  })

  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith('/api/')) {
      sendError(reply, 404, '接口不存在')
      return
    }
    reply.sendFile('index.html')
  })
} else {
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith('/api/')) {
      sendError(reply, 404, '接口不存在')
      return
    }
    sendError(reply, 404, '前端资源未构建，请先执行 npm run build')
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
