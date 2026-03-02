<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BoardTabs from '../components/BoardTabs.vue'
import { api } from '../lib/api'
import {
  SESSION_TYPE_OPTIONS,
  formatDateTime,
  formatDuration,
  formatTypeLabel,
  minutesBetween,
  toDatetimeLocalInput
} from '../lib/time'

const route = useRoute()
const boardId = computed(() => Number(route.params.id))

const board = ref(null)
const sessions = ref([])
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')

const filterType = ref('all')
const formVisible = ref(false)
const editingSessionId = ref(null)

const form = reactive({
  type: 'night',
  startAt: '',
  endAt: '',
  note: ''
})

function typeBadgeClass(type) {
  if (type === 'night') return 'bg-cyan-600 text-white'
  if (type === 'nap') return 'bg-emerald-500 text-white'
  return 'bg-amber-400 text-amber-900'
}

function setDefaultForm() {
  const now = new Date()
  const start = new Date(now.getTime() - 60 * 60 * 1000)

  form.type = 'night'
  form.startAt = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(
    start.getDate()
  ).padStart(2, '0')}T${String(start.getHours()).padStart(2, '0')}:${String(
    start.getMinutes()
  ).padStart(2, '0')}`
  form.endAt = ''
  form.note = ''
}

function sessionDurationLabel(session) {
  if (!session.endAt) {
    return '进行中'
  }
  return formatDuration(minutesBetween(session.startAt, session.endAt))
}

async function loadBoard() {
  const response = await api.get(`/api/boards/${boardId.value}`)
  board.value = response.board
}

async function loadSessions() {
  const query = filterType.value === 'all' ? '' : `?type=${filterType.value}`
  const response = await api.get(`/api/boards/${boardId.value}/sessions${query}`)
  sessions.value = response.sessions || []
}

async function loadPage() {
  loading.value = true
  errorMessage.value = ''

  try {
    await Promise.all([loadBoard(), loadSessions()])
  } catch (error) {
    errorMessage.value = error.message || '加载记录失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  formVisible.value = true
  editingSessionId.value = null
  setDefaultForm()
}

function openEdit(session) {
  formVisible.value = true
  editingSessionId.value = session.id
  form.type = session.type
  form.startAt = toDatetimeLocalInput(session.startAt)
  form.endAt = toDatetimeLocalInput(session.endAt)
  form.note = session.note || ''
}

function closeForm() {
  formVisible.value = false
  editingSessionId.value = null
}

async function submitForm() {
  saving.value = true
  errorMessage.value = ''

  try {
    const payload = {
      type: form.type,
      startAt: form.startAt,
      endAt: form.endAt || null,
      note: form.note
    }

    if (editingSessionId.value) {
      await api.patch(`/api/sessions/${editingSessionId.value}`, payload)
    } else {
      await api.post(`/api/boards/${boardId.value}/sessions`, payload)
    }

    closeForm()
    await loadSessions()
  } catch (error) {
    errorMessage.value = error.message || '保存记录失败'
  } finally {
    saving.value = false
  }
}

async function deleteSession(session) {
  if (!window.confirm('确认删除这条记录吗？')) {
    return
  }

  try {
    await api.delete(`/api/sessions/${session.id}`)
    await loadSessions()
  } catch (error) {
    errorMessage.value = error.message || '删除记录失败'
  }
}

watch(filterType, loadSessions)
watch(boardId, loadPage)

onMounted(() => {
  setDefaultForm()
  loadPage()
})
</script>

<template>
  <div class="screen gap-4">
    <header class="glass-card animate-enter p-5">
      <p class="title-font text-xs uppercase tracking-[0.28em] text-cyan-700/80">Sleep Records</p>
      <h1 class="title-font mt-1 text-3xl text-cyan-950">{{ board?.name || '加载中...' }}</h1>
      <p class="mt-2 text-sm text-cyan-900/70">按单次睡眠记录，支持跨天和三种睡眠类型。</p>
      <div class="mt-4">
        <BoardTabs :board-id="boardId" active="records" />
      </div>
    </header>

    <section class="glass-card p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-2">
          <button
            :class="[
              'min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold transition',
              filterType === 'all' ? 'bg-primary text-white' : 'bg-white/70 text-cyan-900 hover:bg-white'
            ]"
            @click="filterType = 'all'"
          >
            全部
          </button>
          <button
            v-for="option in SESSION_TYPE_OPTIONS"
            :key="option.value"
            :class="[
              'min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold transition',
              filterType === option.value ? 'bg-primary text-white' : 'bg-white/70 text-cyan-900 hover:bg-white'
            ]"
            @click="filterType = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <button class="btn-primary px-4 py-2" @click="openCreate">新增记录</button>
      </div>

      <div v-if="formVisible" class="mt-4 rounded-2xl border border-cyan-100 bg-white/80 p-4">
        <h3 class="mb-3 text-sm font-semibold text-cyan-900">
          {{ editingSessionId ? '编辑记录' : '新增记录' }}
        </h3>

        <div class="grid gap-3 sm:grid-cols-2">
          <label>
            <span class="field-label">类型</span>
            <select v-model="form.type" class="input-field">
              <option v-for="option in SESSION_TYPE_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <label>
            <span class="field-label">备注（可选）</span>
            <input v-model="form.note" class="input-field" placeholder="例如：半夜醒来后再睡" type="text" />
          </label>
          <label>
            <span class="field-label">入睡时间</span>
            <input v-model="form.startAt" class="input-field" required type="datetime-local" />
          </label>
          <label>
            <span class="field-label">苏醒时间（可选）</span>
            <input v-model="form.endAt" class="input-field" type="datetime-local" />
          </label>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button :disabled="saving" class="btn-primary px-4 py-2" @click="submitForm">
            {{ saving ? '保存中...' : '保存记录' }}
          </button>
          <button class="btn-secondary" @click="closeForm">取消</button>
        </div>
      </div>
    </section>

    <p v-if="errorMessage" class="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {{ errorMessage }}
    </p>

    <section v-if="loading" class="glass-card p-8 text-center text-sm text-cyan-900/75">加载中...</section>

    <section
      v-else-if="sessions.length === 0"
      class="glass-card p-8 text-center text-sm text-cyan-900/75"
    >
      当前筛选条件下还没有记录。
    </section>

    <section v-else class="grid gap-3">
      <article v-for="session in sessions" :key="session.id" class="glass-card animate-enter p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span
            :class="[
              'inline-flex min-h-[32px] items-center rounded-full px-3 py-1 text-xs font-semibold',
              typeBadgeClass(session.type)
            ]"
          >
            {{ formatTypeLabel(session.type) }}
          </span>
          <span class="title-font text-sm text-cyan-900">{{ sessionDurationLabel(session) }}</span>
        </div>

        <div class="mt-3 grid gap-2 text-sm text-cyan-900/80 sm:grid-cols-2">
          <p>入睡：{{ formatDateTime(session.startAt) }}</p>
          <p>苏醒：{{ formatDateTime(session.endAt, '进行中') }}</p>
        </div>

        <p v-if="session.note" class="mt-2 rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900/85">
          备注：{{ session.note }}
        </p>

        <div class="mt-4 flex flex-wrap gap-2">
          <button class="btn-secondary" @click="openEdit(session)">编辑</button>
          <button class="btn-danger" @click="deleteSession(session)">删除</button>
        </div>
      </article>
    </section>
  </div>
</template>
