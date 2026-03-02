<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BoardTabs from '../components/BoardTabs.vue'
import { api } from '../lib/api'
import { currentIsoMonth, formatDateTimeWithWeekday, formatDuration, formatTypeLabel } from '../lib/time'

const route = useRoute()
const boardId = computed(() => Number(route.params.id))
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'

const board = ref(null)
const analysis = ref(null)
const month = ref(currentIsoMonth())
const loading = ref(true)
const errorMessage = ref('')

async function loadBoard() {
  const response = await api.get(`/api/boards/${boardId.value}`)
  board.value = response.board
}

async function loadAnalysis() {
  const response = await api.get(
    `/api/boards/${boardId.value}/analysis/monthly?month=${encodeURIComponent(month.value)}&tz=${encodeURIComponent(timezone)}`
  )
  analysis.value = response.analysis
}

async function loadPage() {
  loading.value = true
  errorMessage.value = ''
  try {
    await Promise.all([loadBoard(), loadAnalysis()])
  } catch (error) {
    errorMessage.value = error.message || '加载月分析失败'
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
    errorMessage.value = error.message || '加载月分析失败'
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

const review = computed(() => analysis.value?.review || null)
const sourceRecords = computed(() => analysis.value?.sourceRecords || [])

const reviewBasisText = computed(() => {
  const meta = review.value?.meta
  if (!meta) {
    return ''
  }

  const ageText = meta.age
    ? `${meta.age.years}岁${meta.age.months > 0 ? `${meta.age.months}个月` : ''}`
    : '未设置生日'
  const basis = meta.source === 'birth_date' ? `${ageText}（${meta.profileLabel}）` : `未设置生日，按${meta.profileLabel}`

  return `评测标准：${basis}；建议日睡眠 ${meta.recommendedDurationHours} 小时；建议入睡/醒来 ${meta.recommendedSleepTime} / ${meta.recommendedWakeTime}。`
})

const reviewStatusLabel = {
  excellent: '优秀',
  good: '良好',
  attention: '关注',
  poor: '待改善',
  insufficient: '数据不足'
}

function reviewStatusClass(status) {
  if (status === 'excellent') {
    return 'bg-emerald-100 text-emerald-700'
  }
  if (status === 'good') {
    return 'bg-cyan-100 text-cyan-700'
  }
  if (status === 'attention') {
    return 'bg-amber-100 text-amber-700'
  }
  if (status === 'poor') {
    return 'bg-rose-100 text-rose-700'
  }
  return 'bg-slate-100 text-slate-600'
}

const dailyColumnsStyle = computed(() => {
  const count = analysis.value?.daily?.length || 1
  return {
    gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`
  }
})

function barHeight(minutes) {
  const ratio = (minutes / maxDailyMinutes.value) * 100
  return `${Math.max(ratio, 5)}%`
}

watch(month, reloadAnalysisOnly)
watch(boardId, loadPage)

onMounted(loadPage)
</script>

<template>
  <div class="screen gap-4">
    <header class="glass-card animate-enter p-5">
      <p class="title-font text-xs uppercase tracking-[0.28em] text-cyan-700/80">Monthly Insights</p>
      <h1 class="title-font mt-1 text-3xl text-cyan-950">{{ board?.name || '加载中...' }}</h1>
      <p class="mt-2 text-sm text-cyan-900/70">按月观察总时长、类型占比和每天分布。</p>
      <div class="mt-4">
        <BoardTabs :board-id="boardId" active="analysis-monthly" />
      </div>
    </header>

    <section class="glass-card p-4">
      <div class="flex flex-wrap items-end gap-3">
        <label>
          <span class="field-label">分析月</span>
          <input v-model="month" class="input-field" type="month" />
        </label>
        <div class="rounded-xl bg-cyan-50 px-3 py-2 text-xs text-cyan-800">时区：{{ timezone }}</div>
      </div>
    </section>

    <p v-if="errorMessage" class="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {{ errorMessage }}
    </p>

    <section v-if="loading" class="glass-card p-8 text-center text-sm text-cyan-900/75">加载中...</section>

    <template v-else-if="analysis">
      <section class="glass-card p-4">
        <details>
          <summary class="flex cursor-pointer list-none items-center justify-between gap-2 text-sm text-cyan-900">
            <span class="title-font text-lg text-cyan-950">睡眠数据来源</span>
            <span class="text-xs text-cyan-700/80">默认折叠，点击展开</span>
          </summary>
          <div class="mt-3">
            <p class="text-xs text-cyan-900/65">纳入本月分析的睡眠记录（{{ sourceRecords.length }} 条）</p>

            <div v-if="sourceRecords.length" class="mt-2 max-h-64 space-y-2 overflow-auto pr-1">
              <article
                v-for="(item, index) in sourceRecords"
                :key="`${item.startAt}-${item.endAt}-${item.type}-${index}`"
                class="rounded-xl border border-cyan-100 bg-white/75 px-3 py-2"
              >
                <p class="text-xs font-semibold text-cyan-900">{{ formatTypeLabel(item.type) }}</p>
                <p class="mt-1 text-xs leading-5 text-cyan-900/80">入睡：{{ formatDateTimeWithWeekday(item.startAt) }}</p>
                <p class="text-xs leading-5 text-cyan-900/80">苏醒：{{ formatDateTimeWithWeekday(item.endAt) }}</p>
              </article>
            </div>

            <p v-else class="mt-2 text-xs text-cyan-900/70">当前统计范围内没有可用睡眠记录。</p>
          </div>
        </details>
      </section>

      <section class="glass-card p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="title-font text-xl text-cyan-950">本月评测</h2>
          <p
            v-if="review"
            class="inline-flex items-center rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-800"
          >
            {{ review.level }} · {{ review.score }} 分
          </p>
        </div>
        <p class="mt-2 text-sm leading-6 text-cyan-900/80">{{ review?.summary || '暂无评测结果。' }}</p>
        <p v-if="reviewBasisText" class="mt-1 text-xs leading-5 text-cyan-900/65">{{ reviewBasisText }}</p>

        <div v-if="review?.dimensions?.length" class="mt-4 grid gap-3 md:grid-cols-2">
          <article
            v-for="item in review.dimensions"
            :key="item.key"
            class="rounded-2xl border border-cyan-100 bg-white/80 p-3"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-semibold text-cyan-900">{{ item.label }}</p>
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-cyan-800">{{ item.score }} 分</span>
                <span :class="['rounded-full px-2 py-0.5 text-[11px] font-semibold', reviewStatusClass(item.status)]">
                  {{ reviewStatusLabel[item.status] || '评估中' }}
                </span>
              </div>
            </div>
            <p class="mt-2 text-xs leading-5 text-cyan-900/75">{{ item.message }}</p>
          </article>
        </div>

        <div v-if="review?.suggestions?.length" class="mt-4 rounded-2xl bg-cyan-50 p-3">
          <p class="text-xs font-semibold tracking-wide text-cyan-800">调整建议</p>
          <ul class="mt-2 space-y-1 text-xs leading-5 text-cyan-900/80">
            <li v-for="(item, index) in review.suggestions" :key="`${index}-${item}`">{{ index + 1 }}. {{ item }}</li>
          </ul>
        </div>
      </section>

      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article class="glass-card p-4">
          <p class="text-xs text-cyan-900/60">月总睡眠</p>
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
        <p class="mt-1 text-sm text-cyan-900/70">柱状图显示按苏醒日归属的每日累计睡眠时长。</p>

        <div class="mt-4 overflow-x-auto">
          <div
            class="grid h-52 min-w-[860px] items-end gap-2 rounded-2xl bg-cyan-50 p-3"
            :style="dailyColumnsStyle"
          >
            <div v-for="item in analysis.daily" :key="item.date" class="flex h-full flex-col items-center justify-end gap-2">
              <p class="title-font text-[10px] text-cyan-900/70">{{ item.hours }}h</p>
              <div class="w-full max-w-7 rounded-t-xl bg-primary/85 transition-all" :style="{ height: barHeight(item.minutes) }" />
              <p class="text-xs text-cyan-900/70">{{ item.label.replace('日', '') }}</p>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
