import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import LoginPage from '../pages/LoginPage.vue'
import BoardsPage from '../pages/BoardsPage.vue'
import BoardRecordsPage from '../pages/BoardRecordsPage.vue'
import BoardAnalysisPage from '../pages/BoardAnalysisPage.vue'
import BoardMonthlyAnalysisPage from '../pages/BoardMonthlyAnalysisPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/boards'
    },
    {
      path: '/login',
      name: 'login',
      component: LoginPage
    },
    {
      path: '/boards',
      name: 'boards',
      component: BoardsPage,
      meta: { requiresAuth: true }
    },
    {
      path: '/boards/:id/records',
      name: 'board-records',
      component: BoardRecordsPage,
      meta: { requiresAuth: true }
    },
    {
      path: '/boards/:id/analysis',
      name: 'board-analysis',
      component: BoardAnalysisPage,
      meta: { requiresAuth: true }
    },
    {
      path: '/boards/:id/analysis/monthly',
      name: 'board-monthly-analysis',
      component: BoardMonthlyAnalysisPage,
      meta: { requiresAuth: true }
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/boards'
    }
  ]
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.initialized) {
    await auth.fetchMe()
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return {
      name: 'login',
      query: {
        redirect: to.fullPath
      }
    }
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'boards' }
  }

  return true
})

export default router
