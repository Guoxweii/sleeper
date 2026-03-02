import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(currentDir, '..')
const projectRoot = path.resolve(serverRoot, '..')

dotenv.config({ path: path.join(projectRoot, '.env') })
dotenv.config({ path: path.join(serverRoot, '.env'), override: true })

const dbPathSource = process.env.DB_PATH || './data/sleep.db'
const dbPath = path.isAbsolute(dbPathSource)
  ? dbPathSource
  : path.resolve(projectRoot, dbPathSource)

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

export const config = {
  appPort: Number(process.env.APP_PORT || process.env.PORT || 3000),
  appSecret: process.env.APP_SECRET || 'sleep-dev-secret-change-in-production',
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'changeme123',
  dbPath,
  sessionCookieName: 'sleep_session',
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
  defaultTimezone: process.env.TZ || 'Asia/Shanghai',
  allowedOrigins,
  isProduction: process.env.NODE_ENV === 'production'
}

export const paths = {
  serverRoot,
  projectRoot,
  webDist: path.resolve(projectRoot, 'web', 'dist')
}
