import type { User } from '../../shared/index.ts'

declare module 'fastify' {
  interface FastifyRequest {
    user: User
  }
}
