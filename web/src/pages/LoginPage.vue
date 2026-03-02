<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const form = reactive({
  username: 'admin',
  password: ''
})

const loading = ref(false)
const errorMessage = ref('')

async function submitLogin() {
  loading.value = true
  errorMessage.value = ''

  try {
    await auth.login(form.username.trim(), form.password)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/boards'
    router.replace(redirect)
  } catch (error) {
    errorMessage.value = error.message || '登录失败，请检查账号密码'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="screen justify-center">
    <div class="mx-auto w-full max-w-md animate-enter">
      <div class="glass-card p-6 sm:p-8">
        <div class="mb-6 space-y-2">
          <p class="title-font text-xs uppercase tracking-[0.28em] text-cyan-700/80">Sleep Board</p>
          <h1 class="title-font text-3xl text-cyan-950">家庭睡眠记录</h1>
          <p class="text-sm text-cyan-900/70">登录后可查看所有 Board 并进行周分析、月分析。</p>
        </div>

        <form class="space-y-4" @submit.prevent="submitLogin">
          <label>
            <span class="field-label">用户名</span>
            <input
              v-model="form.username"
              class="input-field"
              autocomplete="username"
              placeholder="请输入用户名"
              required
              type="text"
            />
          </label>

          <label>
            <span class="field-label">密码</span>
            <input
              v-model="form.password"
              class="input-field"
              autocomplete="current-password"
              placeholder="请输入密码"
              required
              type="password"
            />
          </label>

          <p v-if="errorMessage" class="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {{ errorMessage }}
          </p>

          <button :disabled="loading" class="btn-primary w-full" type="submit">
            {{ loading ? '登录中...' : '登录并进入 Board' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
