<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  currentPage: number
  totalPages: number
  total?: number
  pageSize?: number
  pageSizes?: number[]
  disabled?: boolean
  maxVisible?: number
}>(), {
  disabled: false,
  maxVisible: 5,
  pageSize: undefined,
  pageSizes: () => [10, 20, 50],
})

const emit = defineEmits<{
  (e: 'change', page: number): void
  (e: 'changePageSize', size: number): void
}>()

const show = computed(() => props.totalPages > 0)

const currentSize = computed(() => props.pageSize ?? props.pageSizes[0] ?? 10)

const pages = computed<(number | '…')[]>(() => {
  const total = props.totalPages
  const cur = props.currentPage
  if (total <= 6) {
    const arr: (number | '…')[] = []
    for (let i = 1; i <= total; i++) arr.push(i)
    return arr
  }
  const m = Math.ceil(total / 2)
  let left: number[]
  let right: number[]

  if (cur < m) {
    const c = Math.ceil(cur / 3) * 3
    left = [c - 2, c - 1, c]
    right = [total - 2, total - 1, total]
  } else {
    left = [1, 2, 3]
    const groupFromEnd = Math.floor((total - cur) / 3)
    const start = total - (groupFromEnd + 1) * 3 + 1
    right = [start, start + 1, start + 2]
  }

  if (left[2] >= right[0]) {
    const arr: (number | '…')[] = []
    for (let i = 1; i <= total; i++) arr.push(i)
    return arr
  }

  return [...left, '…' as const, ...right]
})

const editingIndex = ref(-1)
const jumpValue = ref('')
const jumpInputRef = ref<HTMLInputElement | null>(null)

const sizeOpen = ref(false)
const sizeDropUp = ref(false)
const sizeBtnRef = ref<HTMLElement | null>(null)

function go(page: number) {
  if (props.disabled) return
  if (page < 1 || page > props.totalPages || page === props.currentPage) return
  emit('change', page)
}

function selectPageSize(size: number) {
  if (props.disabled) return
  sizeOpen.value = false
  emit('changePageSize', size)
}

function toggleSizeMenu() {
  if (props.disabled) return
  if (sizeOpen.value) {
    sizeOpen.value = false
    return
  }
  if (sizeBtnRef.value) {
    const rect = sizeBtnRef.value.getBoundingClientRect()
    const menuHeight = props.pageSizes.length * 36 + 8
    sizeDropUp.value = rect.bottom + menuHeight > window.innerHeight && rect.top - menuHeight > 0
  }
  sizeOpen.value = true
}

function closeSizeMenu() {
  sizeOpen.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (sizeBtnRef.value && !sizeBtnRef.value.contains(e.target as Node)) {
    sizeOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside, true)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside, true)
})

function startJump(index: number) {
  editingIndex.value = index
  jumpValue.value = ''
  nextTick(() => {
    jumpInputRef.value?.focus()
  })
}

function confirmJump() {
  const page = parseInt(jumpValue.value, 10)
  if (!isNaN(page) && page >= 1 && page <= props.totalPages) {
    go(page)
  }
  cancelJump()
}

function cancelJump() {
  editingIndex.value = -1
  jumpValue.value = ''
}

function handleJumpKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    confirmJump()
  } else if (e.key === 'Escape') {
    cancelJump()
  }
}
</script>

<template>
  <div v-if="show" class="pagination-wrap" role="navigation" aria-label="分页">
    <div v-if="pageSizes.length > 1" ref="sizeBtnRef" class="size-selector" :class="{ 'size-open': sizeOpen }">
      <button
        class="size-trigger"
        :disabled="disabled"
        @click.stop="toggleSizeMenu"
      >{{ currentSize }}条/页 <span class="size-arrow">&#9662;</span></button>
      <Transition name="size-fade">
        <div v-if="sizeOpen" class="size-menu" :class="{ 'size-drop-up': sizeDropUp }">
          <button
            v-for="size in pageSizes"
            :key="size"
            :class="['size-option', { active: size === currentSize }]"
            @click.stop="selectPageSize(size)"
          >{{ size }}条/页</button>
        </div>
      </Transition>
    </div>
    <span v-else-if="pageSize != null" class="page-total-fixed">{{ currentSize }}条/页 &nbsp;</span>

    <span v-if="total != null" class="page-total">{{ total }}条</span>

    <button
      class="page-btn page-btn-arrow"
      :disabled="currentPage <= 1 || disabled"
      aria-label="首页"
      title="首页"
      @click="go(1)"
    >&laquo;</button>

    <button
      class="page-btn page-btn-arrow"
      :disabled="currentPage <= 1 || disabled"
      aria-label="上一页"
      title="上一页"
      @click="go(currentPage - 1)"
    >&lsaquo;</button>

    <template v-for="(p, i) in pages" :key="i">
      <input
        v-if="p === '…' && editingIndex === i"
        ref="jumpInputRef"
        v-model="jumpValue"
        type="number"
        :min="1"
        :max="totalPages"
        class="page-jump-input"
        placeholder="#"
        @blur="cancelJump"
        @keydown="handleJumpKeydown"
      />
      <span
        v-else-if="p === '…'"
        class="page-ellipsis"
        @click="startJump(i)"
      >…</span>
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
      class="page-btn page-btn-arrow"
      :disabled="currentPage >= totalPages || disabled"
      aria-label="下一页"
      title="下一页"
      @click="go(currentPage + 1)"
    >&rsaquo;</button>

    <button
      class="page-btn page-btn-arrow"
      :disabled="currentPage >= totalPages || disabled"
      aria-label="末页"
      title="末页"
      @click="go(totalPages)"
    >&raquo;</button>
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

/* ===== 每页条数选择器 ===== */
.size-selector {
  position: relative;
  margin-right: var(--spacing-sm);
}

.size-trigger {
  height: 36px;
  padding: 0 10px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: var(--color-card);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
  user-select: none;
}

.size-trigger:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.size-trigger:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.size-selector.size-open .size-trigger {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.size-arrow {
  font-size: 10px;
  transition: transform 0.15s;
}

.size-selector.size-open .size-arrow {
  transform: rotate(180deg);
}

.size-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  background: var(--color-card);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 9999;
}

.size-menu.size-drop-up {
  top: auto;
  bottom: calc(100% + 4px);
}

.size-option {
  display: block;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}

.size-option:hover {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.size-option.active {
  color: var(--color-primary);
  font-weight: 600;
}

/* drop menu transition */
.size-fade-enter-active,
.size-fade-leave-active {
  transition: opacity 0.12s, transform 0.12s;
}

.size-fade-enter-from,
.size-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.size-drop-up .size-fade-enter-from,
.size-drop-up .size-fade-leave-to {
  transform: translateY(4px);
}

/* ===== 固定 pageSize 占位（仅一个选项时） ===== */
.page-total-fixed {
  margin-right: var(--spacing-sm);
  font-size: 13px;
  color: var(--color-text-secondary);
  user-select: none;
  flex-shrink: 0;
}

.page-total {
  margin-right: var(--spacing-sm);
  font-size: 13px;
  color: var(--color-text-secondary);
  user-select: none;
  flex-shrink: 0;
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
  user-select: none;
}

.page-btn.page-btn-arrow {
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
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
  height: 28px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-tertiary);
  user-select: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  transition: all 0.15s;
}

.page-ellipsis:hover {
  color: var(--color-primary);
  border-color: var(--color-divider);
  background: var(--color-card);
}

.page-jump-input {
  width: 48px;
  height: 28px;
  padding: 0 6px;
  font-size: 13px;
  text-align: center;
  color: var(--color-text-primary);
  background: var(--color-card);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  outline: none;
  -moz-appearance: textfield;
}

.page-jump-input::-webkit-outer-spin-button,
.page-jump-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
