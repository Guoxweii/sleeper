import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { z } from 'zod'
import { timezoneSchema } from '../../shared/index.ts'

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

const configSchema = z.object({
  appPort: z.coerce.number().int().positive(),
  appSecret: z.string().min(1),
  adminUser: z.string().min(1),
  adminPassword: z.string().min(1),
  dbPath: z.string().min(1),
  sessionCookieName: z.string().min(1),
  sessionTtlDays: z.coerce.number().int().positive(),
  defaultTimezone: timezoneSchema,
  allowedOrigins: z.array(z.string().min(1)).min(1),
  isProduction: z.boolean()
})

export const config = configSchema.parse({
  appPort: process.env.APP_PORT || process.env.PORT || 3000,
  appSecret: process.env.APP_SECRET || 'sleep-dev-secret-change-in-production',
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'changeme123',
  dbPath,
  sessionCookieName: 'sleep_session',
  sessionTtlDays: process.env.SESSION_TTL_DAYS || 30,
  defaultTimezone: process.env.TZ || 'Asia/Shanghai',
  allowedOrigins,
  isProduction: process.env.NODE_ENV === 'production'
})

export const paths = {
  serverRoot,
  projectRoot,
  webDist: path.resolve(projectRoot, 'web', 'dist')
}
