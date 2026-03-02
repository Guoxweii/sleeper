<script setup>
import { DateTime } from 'luxon'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const boards = ref([])
const loading = ref(true)
const saving = ref(false)
const formVisible = ref(false)
const editingBoardId = ref(null)
const errorMessage = ref('')

const form = reactive({
  name: '',
  description: ''
})

function formatUpdated(value) {
  const dt = DateTime.fromISO(value, { zone: 'utc' }).toLocal()
  return dt.isValid ? dt.toFormat('MM-dd HH:mm') : '-'
}

async function loadBoards() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await api.get('/api/boards')
    boards.value = response.boards || []
  } catch (error) {
    errorMessage.value = error.message || '加载 Board 失败'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.name = ''
  form.description = ''
  editingBoardId.value = null
}

function openCreate() {
  formVisible.value = true
  resetForm()
}

function openEdit(board) {
  formVisible.value = true
  editingBoardId.value = board.id
  form.name = board.name
  form.description = board.description || ''
}

function closeForm() {
  formVisible.value = false
  resetForm()
}

async function saveBoard() {
  saving.value = true
  errorMessage.value = ''

  try {
    const payload = {
      name: form.name,
      description: form.description
    }

    if (editingBoardId.value) {
      await api.patch(`/api/boards/${editingBoardId.value}`, payload)
    } else {
      await api.post('/api/boards', payload)
    }

    formVisible.value = false
    resetForm()
    await loadBoards()
  } catch (error) {
    errorMessage.value = error.message || '保存 Board 失败'
  } finally {
    saving.value = false
  }
}

async function deleteBoard(board) {
  if (!window.confirm(`确认删除「${board.name}」吗？该 Board 下记录会一并删除。`)) {
    return
  }

  try {
    await api.delete(`/api/boards/${board.id}`)
    await loadBoards()
  } catch (error) {
    errorMessage.value = error.message || '删除 Board 失败'
  }
}

async function logout() {
  await auth.logout()
  router.replace('/login')
}

onMounted(loadBoards)
</script>

<template>
  <div class="screen gap-4">
    <header class="glass-card animate-enter p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="title-font text-xs uppercase tracking-[0.28em] text-cyan-700/80">Boards</p>
          <h1 class="title-font mt-1 text-3xl text-cyan-950">睡眠记录看板</h1>
          <p class="mt-2 text-sm text-cyan-900/70">登录用户可查看全部 Board，支持周分析与月分析。</p>
        </div>
        <button class="btn-secondary" @click="logout">退出登录</button>
      </div>
    </header>

    <section class="glass-card p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="title-font text-xl text-cyan-950">Board 列表</h2>
          <p class="text-sm text-cyan-900/70">当前共 {{ boards.length }} 个 Board</p>
        </div>
        <button class="btn-primary px-4 py-2" @click="openCreate">新建 Board</button>
      </div>

      <div v-if="formVisible" class="mt-4 rounded-2xl border border-cyan-100 bg-white/80 p-4">
        <h3 class="mb-3 text-sm font-semibold text-cyan-900">
          {{ editingBoardId ? '编辑 Board' : '创建 Board' }}
        </h3>
        <div class="grid gap-3 sm:grid-cols-2">
          <label>
            <span class="field-label">名称</span>
            <input v-model="form.name" class="input-field" placeholder="例如：胖虎的睡眠记录" required />
          </label>
          <label>
            <span class="field-label">描述（可选）</span>
            <input v-model="form.description" class="input-field" placeholder="例如：夜间与午睡记录" />
          </label>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button :disabled="saving" class="btn-primary px-4 py-2" @click="saveBoard">
            {{ saving ? '保存中...' : '保存 Board' }}
          </button>
          <button class="btn-secondary" @click="closeForm">
            取消
          </button>
        </div>
      </div>
    </section>

    <p v-if="errorMessage" class="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {{ errorMessage }}
    </p>

    <section v-if="loading" class="glass-card p-8 text-center text-sm text-cyan-900/75">加载中...</section>

    <section v-else-if="boards.length === 0" class="glass-card p-8 text-center text-sm text-cyan-900/75">
      还没有 Board，先创建一个开始记录。
    </section>

    <section v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <article v-for="board in boards" :key="board.id" class="glass-card animate-enter p-4">
        <h3 class="title-font text-xl text-cyan-950">{{ board.name }}</h3>
        <p class="mt-2 min-h-10 text-sm text-cyan-900/70">{{ board.description || '暂无描述' }}</p>
        <p class="mt-3 text-xs text-cyan-900/55">最近更新：{{ formatUpdated(board.updatedAt) }}</p>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <RouterLink :to="{ name: 'board-records', params: { id: board.id } }" class="btn-primary-compact text-center">
            记录
          </RouterLink>
          <RouterLink
            :to="{ name: 'board-analysis', params: { id: board.id } }"
            class="btn-secondary-compact text-center"
          >
            周分析
          </RouterLink>
          <RouterLink
            :to="{ name: 'board-monthly-analysis', params: { id: board.id } }"
            class="btn-secondary-compact text-center"
          >
            月分析
          </RouterLink>
          <button class="btn-secondary-compact" @click="openEdit(board)">编辑</button>
          <button class="btn-danger-compact" @click="deleteBoard(board)">删除</button>
        </div>
      </article>
    </section>
  </div>
</template>
