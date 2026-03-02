<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BoardTabs from '../components/BoardTabs.vue'
import { api } from '../lib/api'
import { currentIsoWeek, formatDuration } from '../lib/time'

const route = useRoute()
const boardId = computed(() => Number(route.params.id))
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'

const board = ref(null)
const analysis = ref(null)
const week = ref(currentIsoWeek())
const loading = ref(true)
const errorMessage = ref('')

async function loadBoard() {
  const response = await api.get(`/api/boards/${boardId.value}`)
  board.value = response.board
}

async function loadAnalysis() {
  const response = await api.get(
    `/api/boards/${boardId.value}/analysis/weekly?week=${encodeURIComponent(week.value)}&tz=${encodeURIComponent(timezone)}`
  )
  analysis.value = response.analysis
}

async function loadPage() {
  loading.value = true
  errorMessage.value = ''
  try {
    await Promise.all([loadBoard(), loadAnalysis()])
  } catch (error) {
    errorMessage.value = error.message || '加载周分析失败'
  } finally {
    loading.value = false
  }
}

async function reloadAnalysisOnly() {
  loading.value = true
  errorMessage.value = ''
  try {
    await loadAnalysis()
  } catch (error) {
    errorMessage.value = error.message || '加载周分析失败'
  } finally {
    loading.value = false
  }
}

const maxDailyMinutes = computed(() => {
  const values = analysis.value?.daily?.map((item) => item.minutes) || []
  return Math.max(...values, 1)
})

const typeRows = computed(() => {
  const source = analysis.value?.totals?.byType || {}
  return [source.night, source.nap, source.fragmented].filter(Boolean)
})

const weeklyReview = computed(() => {
  const current = analysis.value
  if (!current) {
    return ''
  }

  const averageDailyMinutes = current.totals?.averageDailyMinutes || 0
  const nightRatio = current.totals?.byType?.night?.percentage || 0
  const fragmentedRatio = current.totals?.byType?.fragmented?.percentage || 0
  const dailyValues = current.daily?.map((item) => item.minutes) || []
  const activeDays = dailyValues.filter((value) => value > 0).length
  const spread = dailyValues.length ? Math.max(...dailyValues) - Math.min(...dailyValues) : 0

  let amountComment = '本周睡眠总量偏少'
  if (averageDailyMinutes >= 480) {
    amountComment = '本周睡眠总量达标'
  } else if (averageDailyMinutes >= 420) {
    amountComment = '本周睡眠总量接近建议值'
  }

  let stabilityComment = '每日波动较小，作息节奏比较稳定。'
  if (activeDays <= 3) {
    stabilityComment = '本周记录天数较少，建议连续记录以便观察趋势。'
  } else if (spread >= 180) {
    stabilityComment = '每日睡眠时长波动较大，可尝试固定入睡节奏。'
  }

  let structureComment = '夜间与午睡分配较均衡，可按目标继续微调。'
  if (fragmentedRatio >= 20) {
    structureComment = '零星睡眠占比偏高，建议优先提升连续夜间睡眠质量。'
  } else if (nightRatio >= 70) {
    structureComment = '夜间睡眠占比较高，结构较理想。'
  }

  return `${amountComment}；${stabilityComment}${structureComment}`
})

function barHeight(minutes) {
  const ratio = (minutes / maxDailyMinutes.value) * 100
  return `${Math.max(ratio, 5)}%`
}

watch(week, reloadAnalysisOnly)
watch(boardId, loadPage)

onMounted(loadPage)
</script>

<template>
  <div class="screen gap-4">
    <header class="glass-card animate-enter p-5">
      <p class="title-font text-xs uppercase tracking-[0.28em] text-cyan-700/80">Weekly Insights</p>
      <h1 class="title-font mt-1 text-3xl text-cyan-950">{{ board?.name || '加载中...' }}</h1>
      <p class="mt-2 text-sm text-cyan-900/70">按周观察总时长、类型占比和每天分布。</p>
      <div class="mt-4">
        <BoardTabs :board-id="boardId" active="analysis" />
      </div>
    </header>

    <section class="glass-card p-4">
      <div class="flex flex-wrap items-end gap-3">
        <label>
          <span class="field-label">分析周</span>
          <input v-model="week" class="input-field" type="week" />
        </label>
        <div class="rounded-xl bg-cyan-50 px-3 py-2 text-xs text-cyan-800">时区：{{ timezone }}</div>
      </div>
      <p class="mt-3 text-xs text-cyan-900/65">统计口径：整段睡眠按苏醒日归属。</p>
    </section>

    <p v-if="errorMessage" class="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {{ errorMessage }}
    </p>

    <section v-if="loading" class="glass-card p-8 text-center text-sm text-cyan-900/75">加载中...</section>

    <template v-else-if="analysis">
      <section class="glass-card p-4">
        <h2 class="title-font text-xl text-cyan-950">本周评测</h2>
        <p class="mt-2 text-sm leading-6 text-cyan-900/80">{{ weeklyReview }}</p>
      </section>

      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article class="glass-card p-4">
          <p class="text-xs text-cyan-900/60">周总睡眠</p>
          <p class="title-font mt-2 text-2xl text-cyan-950">{{ formatDuration(analysis.totals.totalMinutes) }}</p>
        </article>
        <article class="glass-card p-4">
          <p class="text-xs text-cyan-900/60">日均睡眠</p>
          <p class="title-font mt-2 text-2xl text-cyan-950">
            {{ formatDuration(analysis.totals.averageDailyMinutes) }}
          </p>
        </article>
        <article class="glass-card p-4">
          <p class="text-xs text-cyan-900/60">平均入睡时间</p>
          <p class="title-font mt-2 text-2xl text-cyan-950">{{ analysis.totals.averageSleepTime || '--:--' }}</p>
        </article>
        <article class="glass-card p-4">
          <p class="text-xs text-cyan-900/60">平均醒来时间</p>
          <p class="title-font mt-2 text-2xl text-cyan-950">{{ analysis.totals.averageWakeTime || '--:--' }}</p>
        </article>
      </section>

      <section class="glass-card p-4">
        <h2 class="title-font text-xl text-cyan-950">类型占比</h2>
        <div class="mt-4 space-y-3">
          <article v-for="item in typeRows" :key="item.label" class="rounded-2xl border border-cyan-100 bg-white/75 p-3">
            <div class="mb-2 flex items-center justify-between text-sm text-cyan-900">
              <span>{{ item.label }}</span>
              <span>{{ formatDuration(item.minutes) }} ({{ item.percentage }}%)</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-cyan-100">
              <div class="h-full rounded-full bg-primary" :style="{ width: `${item.percentage}%` }" />
            </div>
          </article>
        </div>
      </section>

      <section class="glass-card p-4">
        <h2 class="title-font text-xl text-cyan-950">每日分布</h2>
        <p class="mt-1 text-sm text-cyan-900/70">柱状图显示每天累计睡眠时长。</p>

        <div class="mt-4 grid h-44 grid-cols-7 items-end gap-2 rounded-2xl bg-cyan-50 p-3">
          <div v-for="item in analysis.daily" :key="item.date" class="flex h-full flex-col items-center justify-end gap-2">
            <p class="title-font text-[10px] text-cyan-900/70">{{ item.hours }}h</p>
            <div class="w-full max-w-8 rounded-t-xl bg-primary/85 transition-all" :style="{ height: barHeight(item.minutes) }" />
            <p class="text-xs text-cyan-900/70">{{ item.label.slice(1) }}</p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
