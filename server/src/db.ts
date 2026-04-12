import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { DateTime } from 'luxon'
import { config } from './config.ts'
import { hashPassword } from './password.ts'

export type SleepDatabase = InstanceType<typeof Database>

interface TableInfoRow {
  name: string
  notnull: number
}

interface CountRow {
  count: number
}

export interface SeededAdminUser {
  id: number
  username: string
  password: string
}

function nowUtcIso(): string {
  return DateTime.utc().toISO({ suppressMilliseconds: true }) ?? ''
}

const MAX_TIME_ISO = '9999-12-31T23:59:59Z'

export function createDb(): SleepDatabase {
  const parentDir = path.dirname(config.dbPath)
  fs.mkdirSync(parentDir, { recursive: true })

  const db = new Database(config.dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

export function migrate(db: SleepDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS boards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      birth_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sleep_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('night', 'nap', 'fragmented')),
      start_at TEXT NOT NULL,
      end_at TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (end_at IS NULL OR end_at > start_at),
      FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sleep_sessions_board_id ON sleep_sessions(board_id);
    CREATE INDEX IF NOT EXISTS idx_sleep_sessions_range ON sleep_sessions(board_id, start_at, end_at);
  `)

  migrateSleepSessionsAllowNullEndAt(db)
  migrateBoardsAddBirthDate(db)
}

function migrateBoardsAddBirthDate(db: SleepDatabase): void {
  const columns = db.prepare('PRAGMA table_info(boards)').all() as TableInfoRow[]
  if (!columns.length) {
    return
  }

  const hasBirthDate = columns.some((column) => column.name === 'birth_date')
  if (hasBirthDate) {
    return
  }

  db.exec('ALTER TABLE boards ADD COLUMN birth_date TEXT')
}

function migrateSleepSessionsAllowNullEndAt(db: SleepDatabase): void {
  const columns = db.prepare('PRAGMA table_info(sleep_sessions)').all() as TableInfoRow[]
  if (!columns.length) {
    return
  }

  const endAtColumn = columns.find((column) => column.name === 'end_at')
  if (!endAtColumn || Number(endAtColumn.notnull) === 0) {
    return
  }

  const migrateTx = db.transaction(() => {
    db.exec('ALTER TABLE sleep_sessions RENAME TO sleep_sessions_old')
    db.exec(`
      CREATE TABLE sleep_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('night', 'nap', 'fragmented')),
        start_at TEXT NOT NULL,
        end_at TEXT,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (end_at IS NULL OR end_at > start_at),
        FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
      )
    `)
    db.exec(`
      INSERT INTO sleep_sessions (id, board_id, type, start_at, end_at, note, created_at, updated_at)
      SELECT id, board_id, type, start_at, end_at, note, created_at, updated_at
      FROM sleep_sessions_old
    `)
    db.exec('DROP TABLE sleep_sessions_old')
    db.exec('CREATE INDEX IF NOT EXISTS idx_sleep_sessions_board_id ON sleep_sessions(board_id)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_sleep_sessions_range ON sleep_sessions(board_id, start_at, end_at)')
  })

  migrateTx()
}

export function seedAdminUser(db: SleepDatabase): SeededAdminUser | null {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get() as CountRow | undefined
  if ((existing?.count ?? 0) > 0) {
    return null
  }

  const createdAt = nowUtcIso()
  const passwordHash = hashPassword(config.adminPassword)

  const result = db
    .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(config.adminUser, passwordHash, createdAt)

  return {
    id: Number(result.lastInsertRowid),
    username: config.adminUser,
    password: config.adminPassword
  }
}

export function seedDefaultBoards(db: SleepDatabase): string[] {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM boards').get() as CountRow | undefined
  if ((existing?.count ?? 0) > 0) {
    return []
  }

  const now = nowUtcIso()
  const names = ['胖虎的睡眠记录', '爸爸的睡眠记录']
  const stmt = db.prepare(
    'INSERT INTO boards (name, description, birth_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  )

  for (const name of names) {
    stmt.run(name, '', null, now, now)
  }

  return names
}

export function hasSessionOverlap(
  db: SleepDatabase,
  boardId: number,
  startAt: string,
  endAt: string | null,
  excludeId: number | null = null
): boolean {
  let sql = `
    SELECT id
    FROM sleep_sessions
    WHERE board_id = ?
      AND start_at < COALESCE(?, '${MAX_TIME_ISO}')
      AND COALESCE(end_at, '${MAX_TIME_ISO}') > ?
  `

  const params: Array<number | string | null> = [boardId, endAt, startAt]

  if (excludeId !== null && excludeId !== undefined) {
    sql += ' AND id != ?'
    params.push(excludeId)
  }

  sql += ' LIMIT 1'
  const row = db.prepare(sql).get(...params)
  return Boolean(row)
}
