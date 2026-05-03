<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BoardTabs from '../components/BoardTabs.vue'
import { api } from '../lib/api.ts'
import {
  boardResponseSchema,
  createSessionBodySchema,
  okResponseSchema,
  sessionResponseSchema,
  sessionsResponseSchema,
  updateSessionBodySchema
} from '../../../shared/index.ts'
import type { Board, Pagination, Session, SessionsResponse, SleepType } from '../../../shared/index.ts'
import {
  SESSION_TYPE_OPTIONS,
  formatDateTimeWithWeekday,
  formatDuration,
  formatTypeLabel,
  minutesBetween,
  toDatetimeLocalInput
} from '../lib/time.ts'

interface SessionsRequestSnapshot {
  boardId: number
  filterType: SleepType | 'all'
  page: number
  pageSize: number
}

interface SessionForm {
  type: SleepType
  startAt: string
  endAt: string
  note: string
}

const route = useRoute()
const boardId = computed(() => Number(route.params.id))
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'

const board = ref<Board | null>(null)
const sessions = ref<Session[]>([])
const loading = ref(true)
const saving = ref(false)
const sessionsLoading = ref(false)
const errorMessage = ref('')

const filterType = ref<SleepType | 'all'>('all')
const page = ref(1)
const pageSize = ref(20)
const formVisible = ref(false)
const editingSessionId = ref<Session['id'] | null>(null)

const pagination = reactive<Pagination>({
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 1,
  hasPrev: false,
  hasNext: false
})

const form = reactive<SessionForm>({
  type: 'night',
  startAt: '',
  endAt: '',
  note: ''
})

let latestPageLoadId = 0
let latestSessionsLoadId = 0

function typeBadgeClass(type: SleepType): string {
  if (type === 'night') return 'bg-cyan-600 text-white'
  if (type === 'nap') return 'bg-emerald-500 text-white'
  return 'bg-amber-400 text-amber-900'
}

function isOngoing(session: Session): boolean {
  return !session.endAt
}

function sessionCardClass(session: Session): string {
  const classes = []

  if (isOngoing(session)) {
    classes.push('border-2 border-amber-300 bg-amber-50/75')
  }

  return classes.join(' ')
}

function setDefaultForm(): void {
  const now = new Date()

  form.type = 'night'
  form.startAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}`
  form.endAt = ''
  form.note = ''
}

function sessionDurationLabel(session: Session): string {
  if (!session.endAt) {
    return '进行中'
  }
  return formatDuration(minutesBetween(session.startAt, session.endAt))
}

function resetPagination(currentPage = 1, currentPageSize = pageSize.value): void {
  pagination.page = currentPage
  pagination.pageSize = currentPageSize
  pagination.total = 0
  pagination.totalPages = 1
  pagination.hasPrev = false
  pagination.hasNext = false
}

function applySessionsResponse(response: SessionsResponse, fallbackPage: number, fallbackPageSize: number): void {
  sessions.value = response.sessions || []

  const meta = response.pagination
  pagination.page = meta.page || fallbackPage
  pagination.pageSize = meta.pageSize || fallbackPageSize
  pagination.total = meta.total || 0
  pagination.totalPages = meta.totalPages || 1
  pagination.hasPrev = Boolean(meta.hasPrev)
  pagination.hasNext = Boolean(meta.hasNext)

  page.value = pagination.page
  pageSize.value = pagination.pageSize
}

function createSessionsRequestSnapshot(): SessionsRequestSnapshot {
  return {
    boardId: boardId.value,
    filterType: filterType.value,
    page: page.value,
    pageSize: pageSize.value
  }
}

function isCurrentSessionsRequest(loadId: number, snapshot: SessionsRequestSnapshot): boolean {
  return (
    loadId === latestSessionsLoadId &&
    snapshot.boardId === boardId.value &&
    snapshot.filterType === filterType.value &&
    snapshot.page === page.value &&
    snapshot.pageSize === pageSize.value
  )
}

async function fetchBoardData(targetBoardId: number) {
  return api.get(`/api/boards/${targetBoardId}`, {
    responseSchema: boardResponseSchema
  })
}

async function fetchSessionsData(snapshot: SessionsRequestSnapshot) {
  const query = new URLSearchParams()
  if (snapshot.filterType !== 'all') {
    query.set('type', snapshot.filterType)
  }
  query.set('page', String(snapshot.page))
  query.set('pageSize', String(snapshot.pageSize))

  return api.get(`/api/boards/${snapshot.boardId}/sessions?${query.toString()}`, {
    responseSchema: sessionsResponseSchema
  })
}

async function loadSessions(): Promise<void> {
  const loadId = ++latestSessionsLoadId
  const snapshot = createSessionsRequestSnapshot()
  sessionsLoading.value = true

  try {
    const response = await fetchSessionsData(snapshot)
    if (!isCurrentSessionsRequest(loadId, snapshot)) {
      return
    }

    applySessionsResponse(response, snapshot.page, snapshot.pageSize)
  } catch (error) {
    if (!isCurrentSessionsRequest(loadId, snapshot)) {
      return
    }

    sessions.value = []
    resetPagination(snapshot.page, snapshot.pageSize)
    throw error
  } finally {
    if (loadId === latestSessionsLoadId) {
      sessionsLoading.value = false
    }
  }
}

async function loadPage(): Promise<void> {
  const loadId = ++latestPageLoadId
  const sessionsLoadId = ++latestSessionsLoadId
  const snapshot = createSessionsRequestSnapshot()
  loading.value = true
  sessionsLoading.value = true
  errorMessage.value = ''
  board.value = null
  sessions.value = []
  resetPagination(snapshot.page, snapshot.pageSize)

  try {
    const [boardResponse, sessionsResponse] = await Promise.all([
      fetchBoardData(snapshot.boardId),
      fetchSessionsData(snapshot)
    ])

    if (loadId === latestPageLoadId && snapshot.boardId === boardId.value) {
      board.value = boardResponse.board
    }

    if (isCurrentSessionsRequest(sessionsLoadId, snapshot)) {
      applySessionsResponse(sessionsResponse, snapshot.page, snapshot.pageSize)
    }
  } catch (error) {
    if (
      loadId !== latestPageLoadId ||
      !isCurrentSessionsRequest(sessionsLoadId, snapshot) ||
      snapshot.boardId !== boardId.value
    ) {
      return
    }

    board.value = null
    sessions.value = []
    resetPagination(snapshot.page, snapshot.pageSize)
    errorMessage.value = error.message || '加载记录失败'
  } finally {
    if (loadId === latestPageLoadId) {
      loading.value = false
    }
    if (loadId === latestPageLoadId && sessionsLoadId === latestSessionsLoadId) {
      sessionsLoading.value = false
    }
  }
}

function openCreate() {
  formVisible.value = true
  editingSessionId.value = null
  setDefaultForm()
}

function openEdit(session: Session): void {
  formVisible.value = true
  editingSessionId.value = session.id
  form.type = session.type
  form.startAt = toDatetimeLocalInput(session.startAt)
  form.endAt = toDatetimeLocalInput(session.endAt)
  form.note = session.note || ''
}

function closeFormInternal(force = false): void {
  if (saving.value && !force) {
    return
  }

  formVisible.value = false
  editingSessionId.value = null
}

function closeForm(): void {
  closeFormInternal(false)
}

async function submitForm(): Promise<void> {
  saving.value = true
  errorMessage.value = ''

  try {
    const payload = {
      type: form.type,
      startAt: form.startAt,
      endAt: form.endAt || null,
      note: form.note,
      timezone
    }

    if (editingSessionId.value) {
      await api.patch(`/api/sessions/${editingSessionId.value}`, payload, {
        bodySchema: updateSessionBodySchema,
        responseSchema: sessionResponseSchema
      })
    } else {
      await api.post(`/api/boards/${boardId.value}/sessions`, payload, {
        bodySchema: createSessionBodySchema,
        responseSchema: sessionResponseSchema
      })
    }

    closeFormInternal(true)
    await loadSessions()
  } catch (error) {
    errorMessage.value = error.message || '保存记录失败'
  } finally {
    saving.value = false
  }
}

async function deleteSession(session: Session): Promise<void> {
  if (!window.confirm('确认删除这条记录吗？')) {
    return
  }

  try {
    await api.delete(`/api/sessions/${session.id}`, {
      responseSchema: okResponseSchema
    })
    await loadSessions()
  } catch (error) {
    errorMessage.value = error.message || '删除记录失败'
  }
}

async function changePage(nextPage: number): Promise<void> {
  if (nextPage < 1 || nextPage === page.value) {
    return
  }

  page.value = nextPage
  errorMessage.value = ''
  try {
    await loadSessions()
  } catch (error) {
    errorMessage.value = error.message || '加载记录失败'
  }
}

watch(filterType, async () => {
  page.value = 1
  errorMessage.value = ''
  try {
    await loadSessions()
  } catch (error) {
    errorMessage.value = error.message || '加载记录失败'
  }
})

watch(boardId, async () => {
  page.value = 1
  await loadPage()
})

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

      <p class="mt-3 text-xs text-cyan-900/70">点击记录右下角“编辑”会弹出窗口。</p>
    </section>

    <p v-if="errorMessage" class="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {{ errorMessage }}
    </p>

    <section v-if="loading" class="glass-card p-8 text-center text-sm text-cyan-900/75">加载中...</section>

    <section
      v-else-if="!sessionsLoading && sessions.length === 0"
      class="glass-card p-8 text-center text-sm text-cyan-900/75"
    >
      当前筛选条件下还没有记录。
    </section>

    <section v-else class="grid gap-3">
      <section v-if="sessionsLoading" class="glass-card p-6 text-center text-sm text-cyan-900/75">
        正在加载记录...
      </section>

      <article
        v-for="session in sessions"
        :key="session.id"
        :class="['glass-card animate-enter p-4', sessionCardClass(session)]"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <span
              :class="[
                'inline-flex min-h-[32px] items-center rounded-full px-3 py-1 text-xs font-semibold',
                typeBadgeClass(session.type)
              ]"
            >
              {{ formatTypeLabel(session.type) }}
            </span>
            <span
              v-if="isOngoing(session)"
              class="inline-flex min-h-[30px] items-center rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold text-amber-800"
            >
              未结束
            </span>
          </div>
          <span :class="['title-font text-sm', isOngoing(session) ? 'text-amber-800' : 'text-cyan-900']">
            {{ sessionDurationLabel(session) }}
          </span>
        </div>

        <div class="mt-3 grid gap-2 text-sm text-cyan-900/80 sm:grid-cols-2">
          <p>入睡：{{ formatDateTimeWithWeekday(session.startAt) }}</p>
          <p>苏醒：{{ formatDateTimeWithWeekday(session.endAt, '进行中') }}</p>
        </div>

        <p v-if="session.note" class="mt-2 rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900/85">
          备注：{{ session.note }}
        </p>

        <div class="mt-4 flex flex-wrap gap-2">
          <button class="btn-secondary" @click="openEdit(session)">编辑</button>
          <button class="btn-danger" @click="deleteSession(session)">删除</button>
        </div>
      </article>

      <section class="glass-card p-4">
        <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-cyan-900/80">
          <p>
            第 {{ pagination.page }} / {{ pagination.totalPages }} 页，共 {{ pagination.total }} 条
          </p>
          <div class="flex items-center gap-2">
            <button
              :disabled="!pagination.hasPrev || sessionsLoading"
              class="btn-secondary px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
              @click="changePage(pagination.page - 1)"
            >
              上一页
            </button>
            <button
              :disabled="!pagination.hasNext || sessionsLoading"
              class="btn-secondary px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
              @click="changePage(pagination.page + 1)"
            >
              下一页
            </button>
          </div>
        </div>
      </section>
    </section>

    <div v-if="formVisible" class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div class="absolute inset-0 bg-cyan-950/45 backdrop-blur-sm" @click="closeForm" />

      <section class="relative z-10 w-full max-w-2xl rounded-3xl border border-cyan-200 bg-white p-5 shadow-2xl sm:p-6">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="title-font text-2xl text-cyan-950">{{ editingSessionId ? '编辑记录' : '新增记录' }}</h3>
            <p class="mt-1 text-xs text-cyan-900/70">修改完成后点击保存即可。</p>
          </div>

          <button
            :disabled="saving"
            class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan-100 text-cyan-800 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            @click="closeForm"
          >
            X
          </button>
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-2">
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

        <div class="mt-5 flex flex-wrap gap-2">
          <button :disabled="saving" class="btn-primary px-4 py-2" @click="submitForm">
            {{ saving ? '保存中...' : '保存记录' }}
          </button>
          <button :disabled="saving" class="btn-secondary" @click="closeForm">取消</button>
        </div>
      </section>
    </div>
  </div>
</template>
