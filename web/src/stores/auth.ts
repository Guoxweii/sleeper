import { defineStore } from 'pinia'
import { api } from '../lib/api.ts'
import { authResponseSchema, loginBodySchema, okResponseSchema } from '../../../shared/index.ts'
import type { User } from '../../../shared/index.ts'

interface AuthState {
  user: User | null
  initialized: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    initialized: false
  }),
  getters: {
    isAuthenticated(state): boolean {
      return Boolean(state.user)
    }
  },
  actions: {
    async fetchMe(): Promise<void> {
      try {
        const response = await api.get('/api/auth/me', {
          responseSchema: authResponseSchema
        })
        this.user = response?.user || null
      } catch (error) {
        this.user = null
      } finally {
        this.initialized = true
      }
    },
    async login(username: string, password: string): Promise<User> {
      const response = await api.post(
        '/api/auth/login',
        {
          username,
          password
        },
        {
          bodySchema: loginBodySchema,
          responseSchema: authResponseSchema
        }
      )
      this.user = response.user
      this.initialized = true
      return response.user
    },
    async logout(): Promise<void> {
      try {
        await api.post('/api/auth/logout', undefined, {
          responseSchema: okResponseSchema
        })
      } finally {
        this.user = null
        this.initialized = true
      }
    }
  }
})
