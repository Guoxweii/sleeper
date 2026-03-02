<script setup>
const props = defineProps({
  boardId: {
    type: [String, Number],
    required: true
  },
  active: {
    type: String,
    required: true
  }
})

function tabClass(current) {
  return props.active === current
    ? 'bg-primary text-white shadow-sm'
    : 'bg-white/60 text-cyan-900 hover:bg-white'
}
</script>

<template>
  <div class="glass-card p-2">
    <div class="grid grid-cols-4 gap-2">
      <RouterLink class="btn-secondary text-center" to="/boards">
        Board 列表
      </RouterLink>
      <RouterLink
        :class="['min-h-[44px] rounded-xl px-4 py-2 text-center text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500', tabClass('records')]"
        :to="{ name: 'board-records', params: { id: boardId } }"
      >
        记录
      </RouterLink>
      <RouterLink
        :class="['min-h-[44px] rounded-xl px-4 py-2 text-center text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500', tabClass('analysis')]"
        :to="{ name: 'board-analysis', params: { id: boardId } }"
      >
        周分析
      </RouterLink>
      <RouterLink
        :class="['min-h-[44px] rounded-xl px-4 py-2 text-center text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500', tabClass('analysis-monthly')]"
        :to="{ name: 'board-monthly-analysis', params: { id: boardId } }"
      >
        月分析
      </RouterLink>
    </div>
  </div>
</template>
