<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import Swal from 'sweetalert2'
import { useLifePlanStore } from '@/stores/lifePlanStore'
import { useRiskFormStore } from '@/stores/riskFormStore'
import { enumLabel } from '@/utils/enumLabels'
import type {
  LifePlan,
  PlanGenerateRequest,
  PunchType,
  CompletionStatus,
} from '@/types/api'

const route = useRoute()
const store = useLifePlanStore()
const riskForm = useRiskFormStore()

// ===== 视图态 =====
/** 'loading' | 'empty' | 'form' | 'generating' | 'display' | 'error' */
const viewMode = ref<'loading' | 'empty' | 'form' | 'generating' | 'display' | 'error'>('loading')

// ===== 表单 =====
const form = reactive({
  age: null as number | null,
  gender: '' as 'male' | 'female' | '',
  height: null as number | null,
  weight: null as number | null,
})
const HABITS = ['久坐少动', '经常熬夜', '饮食不规律', '爱喝甜饮', '有吸烟习惯', '有饮酒习惯'] as const
const selectedHabits = ref<string[]>([])
const advice = ref('')

// ===== 习惯多选 toggle（L4: 补齐实现） =====
function toggleHabit(habit: string) {
  const idx = selectedHabits.value.indexOf(habit)
  if (idx >= 0) selectedHabits.value.splice(idx, 1)
  else selectedHabits.value.push(habit)
}

// ===== BMI 派生（L4: 补齐实现，未填身高体重时显示「-」） =====
const computedBmi = computed(() => {
  if (form.height && form.weight && form.height > 0 && form.weight > 0) {
    return (form.weight / ((form.height / 100) ** 2)).toFixed(1)
  }
  return '-'
})

// ===== 重试拉取方案（L4: 补齐实现，调 store.retryFetchCurrent 后重判 viewMode） =====
async function retryFetch() {
  await store.retryFetchCurrent()
  if (store.error) viewMode.value = 'error'
  else if (store.currentPlan) viewMode.value = 'display'
  else viewMode.value = 'empty'
}

// ===== 生成中阶段文案轮播 =====
const STAGE_TEXTS = [
  '正在分析您的健康数据…',
  '正在生成饮食方案…',
  '正在生成运动方案…',
  '正在个性化调整建议…',
] as const
const stageIndex = ref(0)
const stageText = ref<string>(STAGE_TEXTS[0])
let stageTimer: ReturnType<typeof setInterval> | null = null

// ===== 调整反馈 =====
const adjustFeedback = ref('')
const showAdjust = ref(false)

// ===== 预填（riskFormStore.formData 兜底） =====
function prefillFromRiskForm() {
  riskForm.loadFromStorage() // G1: 先水合 sessionStorage，再读 formData（对齐 Risk.vue restoreForm 范式）
  const fd = riskForm.formData
  if (fd.age != null) form.age = fd.age
  if (fd.gender === 'male' || fd.gender === 'female') form.gender = fd.gender
  if (fd.height != null) form.height = fd.height
  if (fd.weight != null) form.weight = fd.weight
}

// ===== 错误态文案引用（G2: 区分 fetch 失败与 generate 失败来源） =====
const errorRef = computed(() => store.generateError ?? store.error)

// ===== query 提示条（不依赖，仅展示） =====
const riskLevelHint = computed(() => {
  const q = route.query.riskLevel
  return typeof q === 'string' && q ? q : ''
})

// ===== Markdown 渲染（复用 Risk.vue safeAdviceHtml 范式） =====
function safeContentHtml(markdown: unknown): string {
  if (typeof markdown !== 'string') return ''
  const html = marked.parse(markdown, { async: false })
  if (typeof html !== 'string') return ''
  return DOMPurify.sanitize(html) // 单次净化（S6：不双重净化）
}

// ===== 错误消息（复用 Risk.vue getErrorMessage 范式） =====
function getErrorMessage(err: unknown, fallback = '操作失败，请稍后重试'): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as { response?: { data?: { error?: { message?: string }; message?: string }; status?: number } }
    if (axiosErr.response?.data?.error?.message) return axiosErr.response.data.error.message
    if (axiosErr.response?.data?.message) return axiosErr.response.data.message
  }
  return fallback
}

// ===== 时段映射标签（视图派生，不入类型） =====
const DIET_SLOT: Record<number, string> = { 1: '早餐', 2: '午餐', 3: '晚餐', 4: '加餐' }
const SPORT_SLOT: Record<number, string> = { 1: '晨间', 2: '晚间', 3: '周末' }
function slotLabel(item: LifePlan): string {
  if (item.plan_type === 'diet') return DIET_SLOT[item.order_num] ?? item.time_desc
  if (item.plan_type === 'exercise') return SPORT_SLOT[item.order_num] ?? item.time_desc
  return item.time_desc
}

/** 图标派生（按 plan_type + order_num，复刻原型 fa 图标） */
const DIET_ICON: Record<number, string> = { 1: 'fa-sun', 2: 'fa-bowl-food', 3: 'fa-apple-whole', 4: 'fa-moon' }
const SPORT_ICON: Record<number, string> = { 1: 'fa-person-walking', 2: 'fa-dumbbell', 3: 'fa-person-swimming' }
function itemIcon(item: LifePlan): string {
  if (item.plan_type === 'diet') return DIET_ICON[item.order_num] ?? 'fa-utensils'
  if (item.plan_type === 'exercise') return SPORT_ICON[item.order_num] ?? 'fa-person-running'
  return 'fa-clipboard-list'
}

// ===== 排序后列表（order_num 升序） =====
const sortedDiet = computed(() =>
  [...(store.currentPlan?.diet_plans ?? [])].sort((a, b) => a.order_num - b.order_num),
)
const sortedExercise = computed(() =>
  [...(store.currentPlan?.exercise_plans ?? [])].sort((a, b) => a.order_num - b.order_num),
)
const sortedOther = computed(() =>
  [...(store.currentPlan?.other_plans ?? [])].sort((a, b) => a.order_num - b.order_num),
)

// ===== 统计卡（复刻原型 gradient-text） =====
const dietTotal = computed(() => sortedDiet.value.length)
const sportTotal = computed(() => sortedExercise.value.length)
const dietDone = computed(() => sortedDiet.value.filter(i => store.completedMap.get(i.id) === 'completed').length)
const sportDone = computed(() => sortedExercise.value.filter(i => store.completedMap.get(i.id) === 'completed').length)
const progress = computed(() => {
  const total = dietTotal.value + sportTotal.value
  if (total === 0) return 0
  return Math.round(((dietDone.value + sportDone.value) / total) * 100)
})

// ===== 打卡按钮态（视图派生） =====
function isCompleted(itemId: number): boolean {
  return store.completedMap.get(itemId) === 'completed'
}

// ===== 表单校验 =====
function validateForm(): boolean {
  if (form.age == null || form.age < 1 || form.age > 120) return false
  if (form.gender !== 'male' && form.gender !== 'female') return false
  if (form.height == null || form.height <= 0) return false
  if (form.weight == null || form.weight <= 0) return false
  return true
}

// ===== 构造请求体（未决 #2 映射） =====
function buildGenerateRequest(): PlanGenerateRequest {
  return {
    health_info: {
      age: form.age as number,
      gender: form.gender as 'male' | 'female',
      height: form.height as number,
      weight: form.weight as number,
    },
    preferences: {
      dietary: selectedHabits.value.join('；'), // 习惯多选 → dietary
      activity: advice.value,                    // 建议 textarea → activity
    },
  }
}

// ===== 生成中轮播 timer 生命周期 =====
function startStageTimer() {
  stopStageTimer()
  stageIndex.value = 0
  stageText.value = STAGE_TEXTS[0]
  stageTimer = setInterval(() => {
    stageIndex.value = (stageIndex.value + 1) % STAGE_TEXTS.length
    stageText.value = STAGE_TEXTS[stageIndex.value]
  }, 1800)
}
function stopStageTimer() {
  if (stageTimer) { clearInterval(stageTimer); stageTimer = null }
}

// ===== 生成方案 =====
async function handleGenerate() {
  if (store.generating || !validateForm()) return
  viewMode.value = 'generating'
  startStageTimer()
  const ok = await store.generate(buildGenerateRequest())
  stopStageTimer()
  if (ok) {
    viewMode.value = 'display'
    await toastSuccess('方案已生成，请按计划执行')
  } else if (store.isConflict) {
    viewMode.value = 'form'
    await toastInfo('请求过于频繁，请稍后再试')
  } else {
    // 降级：有缓存 → 历史降级提示 + 渲染缓存（isHistoryFallback 由 store.generate() catch 内置位）；无 → error
    if (store.currentPlan) {
      viewMode.value = 'display'
      await toastInfo('生成失败，已展示最近方案，可稍后重试')
    } else {
      viewMode.value = 'error'
    }
  }
}

// ===== 调整方案 =====
async function handleAdjust() {
  if (!store.currentPlan || !adjustFeedback.value.trim()) return
  const ok = await store.adjust({
    plan_id: store.currentPlan.plan_id, // 方案组 ID
    feedback: adjustFeedback.value.trim(),
  })
  if (ok) {
    showAdjust.value = false
    adjustFeedback.value = ''
    await toastSuccess('方案已调整')
  } else {
    await toastError(getErrorMessage(store.adjustError, '调整失败，请稍后重试'))
  }
}

// ===== 打卡 SweetAlert2 弹窗 =====
async function handlePunch(item: LifePlan) {
  // 'other' 不打卡（按钮不渲染，此为防御性判断）
  if (item.plan_type === 'other') return
  const punchType = item.plan_type as PunchType // diet | exercise
  const result = await Swal.fire({
    title: `${item.title} 打卡`,
    input: 'textarea',
    inputPlaceholder: '记录今日执行情况（可选）...',
    showDenyButton: true,            // deny = 未完成
    confirmButtonText: '完成',
    denyButtonText: '未完成',
    confirmButtonColor: '#52C41A',
    denyButtonColor: '#BFBFBF',
    showCancelButton: true,
    cancelButtonText: '取消',
  })
  if (result.isDismissed) return // cancel / esc / backdrop
  const status: CompletionStatus = result.isConfirmed ? 'completed' : 'uncompleted'
  const remarks = typeof result.value === 'string' ? result.value.trim() : ''
  if (!store.currentPlan) return
  try {
    await store.createPunch(
      {
        plan_id: item.id, // 方案项 ID（LifePlan.id，§0 #1 收敛）
        punch_type: punchType,
        completion_status: status,
        remarks: remarks || undefined,
      },
      item.id, // completedMap 索引键 = 方案项 id
    )
    await toastSuccess(status === 'completed' ? '打卡成功，继续加油！' : '已记录未完成')
  } catch (e: unknown) {
    // 409 幂等（30s 内重复）→ toast；其他 → toast 错误（乐观已回滚）
    const status2 = (e as { response?: { status?: number } }).response?.status
    if (status2 === 409) await toastInfo('刚已提交过，请稍后再试')
    else await toastError(getErrorMessage(e, '打卡失败，请稍后重试'))
  }
}

// ===== SweetAlert2 toast 封装（复用 Round 1 tBlock 范式） =====
async function toastSuccess(title: string) {
  await Swal.fire({ toast: true, position: 'top', timer: 1500, showConfirmButton: false, icon: 'success', title })
}
async function toastInfo(title: string) {
  await Swal.fire({ toast: true, position: 'top', timer: 1500, showConfirmButton: false, icon: 'info', title })
}
async function toastError(title: string) {
  await Swal.fire({ toast: true, position: 'top', timer: 2000, showConfirmButton: false, icon: 'error', title })
}

// ===== 切换表单 =====
function showForm() {
  prefillFromRiskForm()
  viewMode.value = 'form'
}
function backToDisplay() {
  if (store.currentPlan) viewMode.value = 'display'
  else viewMode.value = 'empty'
}

// ===== 生命周期 =====
onMounted(async () => {
  prefillFromRiskForm()
  await store.fetchCurrent()
  if (store.error) viewMode.value = 'error'
  else if (store.currentPlan) viewMode.value = 'display'
  else viewMode.value = 'empty'
})

onUnmounted(() => {
  stopStageTimer() // 清理轮播 timer（对齐 Round 1 onUnmounted 清理范式）
})
</script>

<template>
  <div class="life-plan page-enter">
    <!-- Header（渐变圆角，复刻原型 623-633） -->
    <header class="lp-header">
      <div class="lp-header-left">
        <h1 class="lp-title">生活方案</h1>
        <p class="lp-subtitle">个性化饮食与运动建议</p>
      </div>
      <button v-if="store.currentPlan" class="lp-recustomize press" @click="showForm">
        <i class="fa-solid fa-arrows-rotate"></i> 重新定制
      </button>
    </header>

    <!-- query 提示条（未决 #4：仅展示，不依赖） -->
    <div v-if="riskLevelHint" class="lp-query-hint">
      基于您的「{{ riskLevelHint }}」风险评估为您定制方案
    </div>

    <!-- 初始加载态（L5: 防 fetchCurrent 异步期间闪现空态） -->
    <div v-if="viewMode === 'loading'" class="lp-generating">
      <div class="lp-gen-card">
        <div class="lp-gen-spinner"><i class="fa-solid fa-spinner"></i></div>
        <p class="lp-gen-text">加载中...</p>
      </div>
    </div>

    <!-- 无方案引导态 -->
    <div v-else-if="viewMode === 'empty'" class="lp-empty">
      <div class="lp-empty-card">
        <div class="lp-empty-icon"><i class="fa-solid fa-clipboard-list"></i></div>
        <h2 class="lp-empty-title">还没有专属方案</h2>
        <p class="lp-empty-desc">基于您的健康信息，AI 将为您生成个性化饮食与运动方案</p>
        <button class="lp-cta press" @click="showForm">立即定制方案</button>
      </div>
    </div>

    <!-- 生成表单态 -->
    <div v-else-if="viewMode === 'form'" class="lp-form-wrap">
      <div class="lp-form-card">
        <h2 class="lp-section-title">方案定制</h2>
        <!-- BMI 信息条（avatar + 派生 BMI） -->
        <div class="lp-bmi-bar">
          <div class="lp-avatar"><i class="fa-solid fa-user"></i></div>
          <div>
            <p class="lp-bmi-name">健康管理</p>
            <p class="lp-bmi-text">BMI {{ computedBmi }}</p>
          </div>
        </div>
        <!-- 身体信息输入（age/gender/height/weight，预填自 riskForm.formData） -->
        <div class="lp-form-row">
          <label>年龄</label>
          <input v-model.number="form.age" type="number" min="1" max="120" class="lp-input" placeholder="请输入年龄" />
        </div>
        <div class="lp-form-row">
          <label>性别</label>
          <div class="lp-gender-group">
            <button :class="['lp-gender-btn press', form.gender === 'male' ? 'active' : '']" @click="form.gender = 'male'">男</button>
            <button :class="['lp-gender-btn press', form.gender === 'female' ? 'active' : '']" @click="form.gender = 'female'">女</button>
          </div>
        </div>
        <div class="lp-form-row">
          <label>身高(cm)</label>
          <input v-model.number="form.height" type="number" min="50" max="250" class="lp-input" placeholder="请输入身高" />
        </div>
        <div class="lp-form-row">
          <label>体重(kg)</label>
          <input v-model.number="form.weight" type="number" min="20" max="300" class="lp-input" placeholder="请输入体重" />
        </div>
        <!-- 生活习惯多选 chip（→ preferences.dietary） -->
        <div class="lp-form-block">
          <label class="lp-block-label">当前生活习惯</label>
          <div class="lp-habits">
            <button
              v-for="h in HABITS"
              :key="h"
              :class="['lp-habit-chip press', selectedHabits.includes(h) ? 'active' : '']"
              @click="toggleHabit(h)"
            >
              {{ h }}
            </button>
          </div>
        </div>
        <!-- 建议 textarea（→ preferences.activity） -->
        <div class="lp-form-block">
          <label class="lp-block-label">对方案的建议</label>
          <textarea
            v-model="advice"
            placeholder="例如：希望以低GI食物为主，运动以有氧为主..."
            class="lp-textarea"
          ></textarea>
        </div>
        <button
          class="lp-generate-btn press"
          :disabled="store.generating || !validateForm()"
          @click="handleGenerate"
        >
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          {{ store.generating ? 'AI 生成中...' : '生成生活方案' }}
        </button>
      </div>
    </div>

    <!-- 生成中态 -->
    <div v-else-if="viewMode === 'generating'" class="lp-generating">
      <div class="lp-gen-card">
        <div class="lp-gen-spinner"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
        <p class="lp-gen-text">{{ stageText }}</p>
        <div class="lp-gen-progress"><div class="lp-gen-progress-bar"></div></div>
      </div>
    </div>

    <!-- 方案展示态 -->
    <div v-else-if="viewMode === 'display' && store.currentPlan" class="lp-display">
      <!-- 历史降级提示条（对齐 Risk.vue isHistoryFallback 范式） -->
      <div v-if="store.isHistoryFallback" class="lp-fallback-hint">
        AI 服务暂不可用，以下为最近方案，可稍后重试
      </div>

      <!-- 统计卡（gradient-text，复刻原型 675-681） -->
      <div class="lp-stats">
        <div class="lp-stat">
          <p class="lp-stat-num gradient-text">{{ dietDone }}/{{ dietTotal }}</p>
          <p class="lp-stat-label">饮食打卡</p>
        </div>
        <div class="lp-stat-divider"></div>
        <div class="lp-stat">
          <p class="lp-stat-num gradient-text">{{ sportDone }}/{{ sportTotal }}</p>
          <p class="lp-stat-label">运动打卡</p>
        </div>
        <div class="lp-stat-divider"></div>
        <div class="lp-stat">
          <p class="lp-stat-num gradient-text">{{ progress }}%</p>
          <p class="lp-stat-label">今日进度</p>
        </div>
      </div>

      <!-- 饮食管理分组 -->
      <h2 class="lp-group-title">
        <i class="fa-solid fa-utensils"></i>{{ enumLabel('plan_type', 'diet') }}管理
      </h2>
      <div class="lp-card-list">
        <div v-for="item in sortedDiet" :key="item.id" class="lp-item-card">
          <div class="lp-item-head">
            <div class="lp-item-left">
              <div class="lp-item-icon lp-item-icon-diet">
                <i :class="['fa-solid', itemIcon(item)]"></i>
              </div>
              <div>
                <div class="lp-item-meta">
                  <span class="lp-item-slot">{{ slotLabel(item) }}</span>
                </div>
                <h3 class="lp-item-title">{{ item.title }}</h3>
              </div>
            </div>
            <button
              :class="['lp-punch-btn press', isCompleted(item.id) ? 'done' : '']"
              @click="handlePunch(item)"
            >
              <i :class="isCompleted(item.id) ? 'fa-solid fa-check' : 'fa-regular fa-circle'"></i>
              {{ isCompleted(item.id) ? '已打卡' : '打卡' }}
            </button>
          </div>
          <!-- Markdown 净化渲染（S2/S6：marked→DOMPurify 一次→v-html） -->
          <div class="lp-item-content" v-html="safeContentHtml(item.content)"></div>
        </div>
      </div>

      <!-- 运动建议分组 -->
      <h2 class="lp-group-title">
        <i class="fa-solid fa-person-running"></i>{{ enumLabel('plan_type', 'exercise') }}建议
      </h2>
      <div class="lp-card-list">
        <div v-for="item in sortedExercise" :key="item.id" class="lp-item-card">
          <div class="lp-item-head">
            <div class="lp-item-left">
              <div class="lp-item-icon lp-item-icon-sport">
                <i :class="['fa-solid', itemIcon(item)]"></i>
              </div>
              <div>
                <div class="lp-item-meta">
                  <span class="lp-item-slot">{{ slotLabel(item) }}</span>
                </div>
                <h3 class="lp-item-title">{{ item.title }}</h3>
              </div>
            </div>
            <button
              :class="['lp-punch-btn press', isCompleted(item.id) ? 'done' : '']"
              @click="handlePunch(item)"
            >
              <i :class="isCompleted(item.id) ? 'fa-solid fa-check' : 'fa-regular fa-circle'"></i>
              {{ isCompleted(item.id) ? '已打卡' : '打卡' }}
            </button>
          </div>
          <div class="lp-item-content" v-html="safeContentHtml(item.content)"></div>
        </div>
      </div>

      <!-- 其他分组（若有 other_plans：展示卡片但无打卡按钮） -->
      <template v-if="sortedOther.length > 0">
        <h2 class="lp-group-title">
          <i class="fa-solid fa-clipboard-list"></i>{{ enumLabel('plan_type', 'other') }}建议
        </h2>
        <div class="lp-card-list">
          <div v-for="item in sortedOther" :key="item.id" class="lp-item-card">
            <div class="lp-item-head">
              <div class="lp-item-left">
                <div class="lp-item-icon lp-item-icon-other">
                  <i :class="['fa-solid', itemIcon(item)]"></i>
                </div>
                <div>
                  <div class="lp-item-meta">
                    <span class="lp-item-slot">{{ slotLabel(item) }}</span>
                  </div>
                  <h3 class="lp-item-title">{{ item.title }}</h3>
                </div>
              </div>
              <!-- other 不渲染打卡按钮（需求/DDL：punch_type 仅 diet/exercise） -->
            </div>
            <div class="lp-item-content" v-html="safeContentHtml(item.content)"></div>
          </div>
        </div>
      </template>

      <!-- 调整反馈入口 -->
      <button class="lp-adjust-entry press" @click="showAdjust = !showAdjust">
        <i class="fa-solid fa-sliders"></i> 调整方案
      </button>
      <div v-if="showAdjust" class="lp-adjust-card">
        <textarea
          v-model="adjustFeedback"
          placeholder="如：减少晚餐碳水，增加周末运动强度"
          class="lp-textarea"
        ></textarea>
        <button
          class="lp-generate-btn press"
          :disabled="!adjustFeedback.trim()"
          @click="handleAdjust"
        >
          提交调整
        </button>
      </div>

      <!-- AI 免责提示条（恒显底部） -->
      <div class="lp-disclaimer">
        AI 生成内容仅供参考，不能替代专业医疗诊断，如有不适请及时就医
      </div>
    </div>

    <!-- 错误态（G2: 统一读 errorRef = generateError ?? error，区分 fetch/generate 失败来源） -->
    <div v-else-if="viewMode === 'error'" class="lp-error">
      <p class="lp-error-text">{{ getErrorMessage(errorRef, '方案加载失败') }}</p>
      <button class="lp-retry press" @click="retryFetch">重试</button>
    </div>
  </div>
</template>

<style scoped>
.life-plan {
  max-width: 480px;
  margin: 0 auto;
  padding-bottom: calc(var(--tab-bar-height) + 8px);
  min-height: 100vh;
  background: var(--color-bg);
}

/* Header 渐变圆角（复刻原型 from-blue-600 to-sky-500） */
.lp-header {
  background: linear-gradient(135deg, #4A90D9, #38BDF8);
  color: #fff;
  padding: 48px var(--spacing-xl) var(--spacing-2xl);
  border-radius: 0 0 24px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.lp-header-left {
  flex: 1;
}
.lp-title {
  font-size: var(--font-size-h1);
  font-weight: 700;
}
.lp-subtitle {
  font-size: var(--font-size-caption);
  opacity: 0.85;
  margin-top: 2px;
}
.lp-recustomize {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: var(--font-size-caption);
  padding: 6px 12px;
  border-radius: var(--radius-full);
  border: none;
  backdrop-filter: blur(4px);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 通用卡片 */
.lp-empty-card,
.lp-form-card,
.lp-item-card,
.lp-gen-card,
.lp-adjust-card {
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-xl);
  margin: var(--spacing-lg) var(--spacing-lg);
}

/* 无方案引导态 */
.lp-empty {
  padding-top: var(--spacing-2xl);
}
.lp-empty-card {
  text-align: center;
  padding: var(--spacing-2xl) var(--spacing-xl);
}
.lp-empty-icon {
  width: 80px;
  height: 80px;
  background: var(--color-primary-light);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--spacing-lg);
  font-size: 32px;
  color: var(--color-primary);
}
.lp-empty-title {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}
.lp-empty-desc {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xl);
  line-height: 1.5;
}

/* 表单 */
.lp-section-title {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-lg);
}
.lp-bmi-bar {
  background: #F8FAFC;
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}
.lp-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  font-size: 20px;
  flex-shrink: 0;
}
.lp-bmi-name {
  font-size: var(--font-size-body);
  font-weight: 700;
  color: var(--color-text-primary);
}
.lp-bmi-text {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}
.lp-form-row {
  margin-bottom: var(--spacing-md);
}
.lp-form-row label {
  display: block;
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xs);
}
.lp-gender-group {
  display: flex;
  gap: var(--spacing-sm);
}
.lp-gender-btn {
  flex: 1;
  padding: 8px 12px;
  border-radius: var(--radius-full);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
  border: 2px solid transparent;
  cursor: pointer;
}
.lp-gender-btn.active {
  background: var(--color-primary-light);
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.lp-form-block {
  margin-bottom: var(--spacing-lg);
}
.lp-block-label {
  display: block;
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}
.lp-habits {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}

/* gradient-text（复刻原型统计卡渐变文字） */
.gradient-text {
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(135deg, #4A90D9, #38BDF8);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* 统计卡 */
.lp-stats {
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-lg);
  margin: var(--spacing-lg);
  display: flex;
  justify-content: space-around;
  text-align: center;
}
.lp-stat-divider {
  width: 1px;
  background: var(--color-divider);
}
.lp-stat-label {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-top: 2px;
}

/* 分组标题 */
.lp-group-title {
  font-size: var(--font-size-h3);
  font-weight: 700;
  color: var(--color-text-primary);
  margin: var(--spacing-lg) var(--spacing-lg) var(--spacing-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}
.lp-group-title i {
  color: var(--color-primary);
}

/* 卡片列表 */
.lp-card-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

/* 方案项卡片 */
.lp-item-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-sm);
}
.lp-item-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1;
  min-width: 0;
}
.lp-item-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}
.lp-item-icon-diet {
  background: var(--color-primary-light);
  color: var(--color-primary);
}
.lp-item-icon-sport {
  background: #E8F8EE;
  color: var(--color-accent);
}
.lp-item-icon-other {
  background: #F5F0FF;
  color: #8B5CF6;
}
.lp-item-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-bottom: 2px;
}
.lp-item-slot {
  font-size: 11px;
  color: var(--color-text-disabled);
}
.lp-item-title {
  font-size: var(--font-size-body);
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.3;
}

/* 生成按钮（复刻原型 wand-magic-sparkles 渐变） */
.lp-cta,
.lp-generate-btn {
  background: linear-gradient(135deg, #4A90D9, #38BDF8);
  color: #fff;
  border: none;
  border-radius: var(--radius-button);
  padding: 12px 24px;
  font-weight: 700;
  width: 100%;
  box-shadow: var(--shadow-md);
  cursor: pointer;
  font-size: var(--font-size-body);
}
.lp-cta {
  width: auto;
  padding: 12px 32px;
}
.lp-generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 按压动画 */
.press:active {
  transform: scale(0.96);
  transition: var(--transition-fast);
}

/* 习惯 chip */
.lp-habit-chip {
  padding: 6px 12px;
  border-radius: var(--radius-full);
  background: var(--color-primary-light);
  color: var(--color-text-secondary);
  font-size: var(--font-size-caption);
  border: none;
  cursor: pointer;
  transition: var(--transition-fast);
}
.lp-habit-chip.active {
  background: var(--color-primary);
  color: #fff;
}

/* textarea / input */
.lp-textarea,
.lp-input {
  width: 100%;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: var(--font-size-body);
  font-family: var(--font-family);
  outline: none;
  transition: border-color var(--transition-fast);
}
.lp-textarea:focus,
.lp-input:focus {
  border-color: var(--color-primary);
}
.lp-textarea {
  min-height: 80px;
  resize: none;
}

/* 打卡按钮态 */
.lp-punch-btn {
  padding: 6px 12px;
  border-radius: var(--radius-full);
  background: var(--color-primary-light);
  color: var(--color-text-secondary);
  font-size: var(--font-size-caption);
  font-weight: 700;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: var(--transition-fast);
}
.lp-punch-btn.done {
  background: var(--color-accent);
  color: #fff;
}

/* 方案正文（Markdown 渲染后样式收敛） */
.lp-item-content {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  line-height: 1.6;
}
.lp-item-content :deep(p) {
  margin: 4px 0;
}
.lp-item-content :deep(ul),
.lp-item-content :deep(ol) {
  padding-left: 20px;
  margin: 4px 0;
}

/* 生成中不定进度条动画 */
.lp-gen-text {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  text-align: center;
}
.lp-gen-progress {
  height: 6px;
  background: var(--color-divider);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-top: 16px;
}
.lp-gen-progress-bar {
  height: 100%;
  width: 40%;
  background: linear-gradient(135deg, #4A90D9, #38BDF8);
  border-radius: var(--radius-full);
  animation: lp-indeterminate 1.4s ease-in-out infinite;
}
@keyframes lp-indeterminate {
  0% {
    margin-left: -40%;
  }
  100% {
    margin-left: 100%;
  }
}
.lp-gen-spinner {
  font-size: 32px;
  color: var(--color-primary);
  text-align: center;
  animation: lp-pulse 1.5s ease-in-out infinite;
}
@keyframes lp-pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

/* 历史降级提示条（对齐 Risk.vue #FFF7E6/#FAAD14 范式） */
.lp-fallback-hint {
  background: #FFF7E6;
  border: 1px solid var(--color-warning);
  color: var(--color-warning);
  font-size: var(--font-size-caption);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  margin: var(--spacing-lg);
}

/* AI 免责提示条（恒显底部） */
.lp-disclaimer {
  margin: var(--spacing-lg);
  padding: 10px 12px;
  background: var(--color-primary-light);
  color: var(--color-text-secondary);
  font-size: var(--font-size-caption);
  border-radius: var(--radius-md);
  text-align: center;
  line-height: 1.5;
}

/* query 提示条 */
.lp-query-hint {
  margin: var(--spacing-lg);
  padding: 8px 12px;
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  font-size: var(--font-size-caption);
  border-radius: var(--radius-md);
}

/* 错误态 */
.lp-error {
  text-align: center;
  padding: var(--spacing-2xl) var(--spacing-xl);
  margin-top: var(--spacing-2xl);
}
.lp-error-text {
  font-size: var(--font-size-body);
  color: var(--color-danger);
  margin-bottom: var(--spacing-lg);
}
.lp-retry {
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-button);
  padding: 10px 32px;
  font-size: var(--font-size-body);
  font-weight: 700;
  cursor: pointer;
}

/* 调整入口 */
.lp-adjust-entry {
  display: block;
  margin: var(--spacing-lg) auto;
  padding: 10px 20px;
  background: var(--color-card);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
  cursor: pointer;
}
.lp-adjust-entry:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

/* 页面进入动画 */
.page-enter {
  animation: fadeIn 0.3s ease;
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
