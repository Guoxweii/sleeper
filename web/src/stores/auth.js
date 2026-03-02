import { defineStore } from 'pinia'
import { api } from '../lib/api'

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
        const response = await api.get('/api/auth/me')
        this.user = response?.user || null
      } catch (error) {
        this.user = null
      } finally {
        this.initialized = true
      }
    },
    async login(username, password) {
      const response = await api.post('/api/auth/login', {
        username,
        password
      })
      this.user = response.user
      this.initialized = true
      return response.user
    },
    async logout() {
      try {
        await api.post('/api/auth/logout')
      } finally {
        this.user = null
        this.initialized = true
      }
    }
  }
})
