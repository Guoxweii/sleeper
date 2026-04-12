import { defineStore } from 'pinia'
import { api } from '../lib/api'
import { authResponseSchema, loginBodySchema, okResponseSchema } from '../../../shared/index.js'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    initialized: false
  }),
  getters: {
    isAuthenticated(state) {
      return Boolean(state.user)
    }
  },
  actions: {
    async fetchMe() {
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
    async login(username, password) {
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
    async logout() {
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
