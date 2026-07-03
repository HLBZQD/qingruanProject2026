<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  currentPage: number
  totalPages: number
  disabled?: boolean
  maxVisible?: number
}>(), {
  disabled: false,
  maxVisible: 5,
})

const emit = defineEmits<{
  (e: 'change', page: number): void
}>()

const show = computed(() => props.totalPages > 1)

/** 计算可见页码列表（含首尾页与省略号占位）。 */
const pages = computed<(number | '…')[]>(() => {
  const total = props.totalPages
  const cur = props.currentPage
  const max = props.maxVisible
  if (total <= max) {
    const arr: (number | '…')[] = []
    for (let i = 1; i <= total; i++) arr.push(i)
    return arr
  }
  const list: (number | '…')[] = []
  const half = Math.floor(max / 2)
  let start = Math.max(1, cur - half)
  let end = Math.min(total, start + max - 1)
  start = Math.max(1, end - max + 1)
  if (start > 1) {
    list.push(1)
    if (start > 2) list.push('…')
  }
  for (let i = start; i <= end; i++) list.push(i)
  if (end < total) {
    if (end < total - 1) list.push('…')
    list.push(total)
  }
  return list
})

function go(page: number) {
  if (props.disabled) return
  if (page < 1 || page > props.totalPages || page === props.currentPage) return
  emit('change', page)
}
</script>

<template>
  <div v-if="show" class="pagination-wrap" role="navigation" aria-label="分页">
    <button
      class="page-btn"
      :disabled="currentPage <= 1 || disabled"
      aria-label="上一页"
      @click="go(currentPage - 1)"
    >
      上一页
    </button>
    <template v-for="(p, i) in pages" :key="i">
      <span v-if="p === '…'" class="page-ellipsis" aria-hidden="true">…</span>
      <button
        v-else
        :class="['page-btn', { active: p === currentPage }]"
        :disabled="disabled"
        :aria-current="p === currentPage ? 'page' : undefined"
        @click="go(p as number)"
      >
        {{ p }}
      </button>
    </template>
    <button
      class="page-btn"
      :disabled="currentPage >= totalPages || disabled"
      aria-label="下一页"
      @click="go(currentPage + 1)"
    >
      下一页
    </button>
  </div>
</template>

<style scoped>
.pagination-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  padding: var(--spacing-md) 0 var(--spacing-lg);
}

.page-btn {
  min-width: 36px;
  height: 36px;
  padding: 0 var(--spacing-sm);
  font-size: 13px;
  color: var(--color-text-secondary);
  background: var(--color-card);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.page-btn:hover:not(:disabled):not(.active) {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.page-btn.active {
  color: #fff;
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-ellipsis {
  min-width: 28px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-tertiary);
  user-select: none;
}
</style>
