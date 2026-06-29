<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRiskFormStore } from '@/stores/riskFormStore'
import { api } from '@/composables/useApi'
import { renderMarkdown } from '@/composables/useMarkdown'
import Swal from 'sweetalert2'
import type { RiskPredictRequest, RiskPredictResponse, RiskHistoryItem } from '@/types/api'

const router = useRouter()
const store = useRiskFormStore()

const currentStep = ref<1 | 2 | 3>(1)
const loading = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)
const result = ref<RiskPredictResponse | null>(null)
const isHistoryFallback = ref(false)
let retryTimer: ReturnType<typeof setTimeout> | null = null
const retryCooldown = ref(false)
let predictAbort: AbortController | null = null

// 步骤1 表单
const step1 = reactive({
  diabetes_history: '' as string,
  diabetes_type: '' as string,
})

// 步骤2 表单
const step2 = reactive({
  age: null as number | null,
  gender: '' as string,
  height: null as number | null,
  weight: null as number | null,
  waist: null as number | null,
  systolic_bp: null as number | null,
  family_history: '' as string,
  pregnancy: false,
})

const fieldError = ref('')

const HISTORY_OPTIONS = [
  { value: 'healthy', label: '健康 (无糖尿病)', icon: 'fa-face-smile', desc: '目前血糖指标正常' },
  { value: 'prediabetes', label: '糖尿病前期', icon: 'fa-triangle-exclamation', desc: '血糖偏高，需警惕' },
  { value: 'diagnosed', label: '已确诊糖尿病', icon: 'fa-user-doctor', desc: '已接受医学诊断' },
] as const

const DIABETES_TYPE_OPTIONS = [
  { value: 'type1', label: '1型糖尿病' },
  { value: 'type2', label: '2型糖尿病' },
  { value: 'gestational', label: '妊娠期糖尿病' },
  { value: 'other', label: '其他特殊类型' },
] as const

const GENDER_OPTIONS = [
  { value: 'male', label: '男', icon: 'fa-mars' },
  { value: 'female', label: '女', icon: 'fa-venus' },
] as const

const FAMILY_HISTORY_OPTIONS = [
  { value: 'yes', label: '有', icon: 'fa-check' },
  { value: 'no', label: '无', icon: 'fa-xmark' },
] as const

const VALID_RISK_LEVELS = ['low', 'medium', 'high'] as const

watch(() => step1.diabetes_history, (val) => {
  if (val !== 'diagnosed') step1.diabetes_type = ''
})

const showDiabetesType = computed(() => step1.diabetes_history === 'diagnosed')
const showPregnancy = computed(() => step2.gender === 'female')

function safeAdviceHtml(markdown: unknown): string {
  return renderMarkdown(markdown)
}

function restoreForm() {
  const restored = store.loadFromStorage()
  if (restored) {
    currentStep.value = store.currentStep
    if (store.result) result.value = store.result
    const fd = store.formData
    if (fd.diabetes_history) step1.diabetes_history = fd.diabetes_history
    if (fd.diabetes_type) step1.diabetes_type = fd.diabetes_type
    if (fd.age != null) step2.age = fd.age
    if (fd.gender) step2.gender = fd.gender
    if (fd.height != null) step2.height = fd.height
    if (fd.weight != null) step2.weight = fd.weight
    if (fd.waist != null) step2.waist = fd.waist
    if (fd.systolic_bp != null) step2.systolic_bp = fd.systolic_bp
    if (fd.family_history) step2.family_history = fd.family_history
    if (fd.pregnancy != null) step2.pregnancy = fd.pregnancy
  }
  // 恢复到了步骤3但缺结果，回退到步骤2
  if (currentStep.value === 3 && !result.value) {
    currentStep.value = 2
  }
  // 恢复后重新校验，非法数据则重置
  if (currentStep.value >= 2 && !validateStep2()) {
    store.reset()
    currentStep.value = 1
    step1.diabetes_history = ''
    step2.age = null; step2.gender = ''; step2.height = null; step2.weight = null
    step2.waist = null; step2.systolic_bp = null; step2.family_history = ''; step2.pregnancy = false
  }
  if (currentStep.value >= 1 && !validateStep1()) {
    store.reset()
    currentStep.value = 1
    step1.diabetes_history = ''
  }
}

onMounted(restoreForm)
onUnmounted(() => {
  predictAbort?.abort()
  if (retryTimer) clearTimeout(retryTimer)
})

function isValidNumber(val: unknown, min: number, max: number): boolean {
  if (val === null || val === undefined) return false
  if (typeof val !== 'number') return false
  if (!Number.isFinite(val)) return false
  return val >= min && val <= max
}

function validateStep1(): boolean {
  if (!step1.diabetes_history) {
    fieldError.value = '请选择您的病史状态'
    return false
  }
  if (step1.diabetes_history === 'diagnosed' && !step1.diabetes_type) {
    fieldError.value = '请选择糖尿病类型'
    return false
  }
  fieldError.value = ''
  return true
}

function validateStep2(): boolean {
  if (!isValidNumber(step2.age, 1, 120)) {
    fieldError.value = '请输入有效年龄（1-120）'
    return false
  }
  if (!step2.gender) {
    fieldError.value = '请选择性别'
    return false
  }
  if (!isValidNumber(step2.height, 50, 250)) {
    fieldError.value = '请输入有效身高（50-250 cm）'
    return false
  }
  if (!isValidNumber(step2.weight, 20, 300)) {
    fieldError.value = '请输入有效体重（20-300 kg）'
    return false
  }
  if (step2.waist !== null && step2.waist !== undefined) {
    if (!isValidNumber(step2.waist, 30, 200) || step2.waist === 0) {
      fieldError.value = '请输入有效腰围（30-200 cm）或留空'
      return false
    }
  }
  if (step2.systolic_bp !== null && step2.systolic_bp !== undefined) {
    if (!isValidNumber(step2.systolic_bp, 60, 250) || step2.systolic_bp === 0) {
      fieldError.value = '请输入有效收缩压（60-250 mmHg）或留空'
      return false
    }
  }
  if (!step2.family_history) {
    fieldError.value = '请选择家族糖尿病史'
    return false
  }
  fieldError.value = ''
  return true
}

function goStep1Next() {
  if (!validateStep1()) return
  store.saveStep(2, {
    diabetes_history: step1.diabetes_history as RiskPredictRequest['diabetes_history'],
    diabetes_type: (step1.diabetes_type || undefined) as RiskPredictRequest['diabetes_type'],
  })
  currentStep.value = 2
}

function goStep2Prev() {
  currentStep.value = 1
}

function buildPayload(): RiskPredictRequest {
  const age = step2.age
  const height = step2.height
  const weight = step2.weight
  if (age == null || height == null || weight == null) {
    throw new Error('buildPayload: required fields not validated')
  }
  return {
    diabetes_history: step1.diabetes_history as RiskPredictRequest['diabetes_history'],
    diabetes_type: (step1.diabetes_type || undefined) as RiskPredictRequest['diabetes_type'],
    age,
    gender: step2.gender as RiskPredictRequest['gender'],
    height,
    weight,
    waist: (step2.waist != null && step2.waist !== undefined) ? step2.waist : undefined,
    systolic_bp: (step2.systolic_bp != null && step2.systolic_bp !== undefined) ? step2.systolic_bp : undefined,
    family_history: step2.family_history as RiskPredictRequest['family_history'],
    pregnancy: step2.gender === 'female' ? step2.pregnancy : undefined,
  }
}

function isValidRiskResult(r: unknown): r is RiskPredictResponse {
  if (!r || typeof r !== 'object') return false
  const obj = r as Record<string, unknown>
  return typeof obj.record_id === 'number'
    && typeof obj.risk_score === 'number'
    && typeof obj.risk_level === 'string'
    && typeof obj.advice === 'string'
    && VALID_RISK_LEVELS.includes(obj.risk_level as typeof VALID_RISK_LEVELS[number])
}

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
    if (axiosErr.response?.data?.error?.message) return axiosErr.response.data.error.message
  }
  return '预测失败，请稍后重试'
}

function toFallbackRiskResponse(item: RiskHistoryItem): RiskPredictResponse {
  return {
    record_id: item.id,
    risk_score: item.risk_score,
    risk_level: item.risk_level,
    risk_level_label: item.risk_level_label,
    matched_diabetes_type: item.matched_diabetes_type,
    advice: '### AI 服务暂不可用\n\n以下为最近一次历史预测评分。建议稍后重试获取完整分析。',
    created_at: item.created_at,
  }
}

async function submitPredict() {
  if (!validateStep2() || submitting.value) return
  submitting.value = true

  let payload: RiskPredictRequest
  try {
    payload = buildPayload()
  } catch {
    error.value = '表单数据不完整，请返回重填'
    submitting.value = false
    return
  }
  store.saveStep(3, payload)
  currentStep.value = 3
  loading.value = true
  error.value = null
  isHistoryFallback.value = false
  predictAbort?.abort()
  predictAbort = new AbortController()

  try {
    const res = await api.post<{ success: boolean; data: RiskPredictResponse }>('/risk/predict', payload, {
      signal: predictAbort.signal,
    })
    const data = res.data.data
    if (!isValidRiskResult(data)) {
      throw new Error('后端返回数据格式异常')
    }
    result.value = data
    store.saveResult(data)
    store.clearSession()
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      loading.value = false
      submitting.value = false
      return
    }
    const msg = getErrorMessage(err)
    error.value = msg
    isHistoryFallback.value = true
    store.clearSession()
    let historyFailed = false
    try {
      const historyRes = await api.get<{ success: boolean; data: RiskHistoryItem[]; pagination: unknown }>('/risk/history', {
        params: { page: 1, pageSize: 1 },
        signal: predictAbort!.signal,
      })
      if (historyRes.data.data?.length > 0) {
        result.value = toFallbackRiskResponse(historyRes.data.data[0])
      } else {
        historyFailed = true
      }
    } catch {
      historyFailed = true
    }
    if (historyFailed && !result.value) {
      error.value = msg + '。暂无历史预测记录，请稍后重试'
    }
  } finally {
    loading.value = false
    submitting.value = false
  }
}

function retryPredict() {
  if (retryCooldown.value) return
  retryCooldown.value = true
  retryTimer = setTimeout(() => { retryCooldown.value = false }, 5000)
  submitPredict()
}

function restart() {
  if (retryTimer) clearTimeout(retryTimer)
  retryCooldown.value = false
  result.value = null
  error.value = null
  isHistoryFallback.value = false
  currentStep.value = 1
  step1.diabetes_history = ''
  step1.diabetes_type = ''
  step2.age = null
  step2.gender = ''
  step2.height = null
  step2.weight = null
  step2.waist = null
  step2.systolic_bp = null
  step2.family_history = ''
  step2.pregnancy = false
  store.reset()
}

function goToLifePlan() {
  router.push({
    path: '/life-plan',
    query: { riskLevel: result.value?.risk_level, diabetesType: result.value?.matched_diabetes_type },
  })
}

const stepLabels = ['病史状态', '健康信息', '评估结果']

const riskMeta = computed(() => {
  if (!result.value) return null
  switch (result.value.risk_level) {
    case 'low':
      return { label: '低风险', color: '#52C41A', bg: '#F0F9EB', icon: 'fa-shield-heart' }
    case 'medium':
      return { label: '中风险', color: '#FAAD14', bg: '#FFFBE6', icon: 'fa-triangle-exclamation' }
    case 'high':
      return { label: '高风险', color: '#FF4D4F', bg: '#FFF1F0', icon: 'fa-circle-exclamation' }
    default:
      return { label: '未知风险', color: '#999999', bg: '#F5F5F5', icon: 'fa-question-circle' }
  }
})

const riskPercent = computed(() => {
  if (!result.value) return 0
  return Math.min(100, Math.max(0, (result.value.risk_score / 51) * 100))
})
</script>

<template>
  <div class="risk-page">
    <header class="risk-header">
      <button class="back-button press" aria-label="返回" @click="router.back()">
        <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
      </button>
      <h1 class="risk-title">糖尿病风险预测</h1>
      <div class="header-spacer" aria-hidden="true"></div>
    </header>

    <main class="risk-main">
      <!-- 步骤指示器 -->
      <nav class="step-progress" aria-label="评估进度">
        <template v-for="step in 3" :key="step">
          <div class="step-node" :class="{ active: currentStep >= step, current: currentStep === step }">
            <div class="step-circle" aria-hidden="true">
              <i v-if="currentStep > step" class="fa-solid fa-check"></i>
              <span v-else>{{ step }}</span>
            </div>
            <span class="step-label">{{ stepLabels[step - 1] }}</span>
          </div>
          <div v-if="step < 3" class="step-connector" :class="{ active: currentStep > step }" aria-hidden="true"></div>
        </template>
      </nav>

      <!-- 步骤1：病史状态 -->
      <section v-show="currentStep === 1" class="step-panel" aria-labelledby="step1-title">
        <div class="step-header">
          <span class="step-badge">步骤 1/3</span>
          <h2 id="step1-title" class="step-title">您的糖尿病病史状态是？</h2>
          <p class="step-desc">选择最符合您当前健康状况的选项</p>
        </div>

        <div class="option-list" role="radiogroup" aria-label="病史状态选项">
          <label
            v-for="opt in HISTORY_OPTIONS"
            :key="opt.value"
            class="option-card press"
            :class="{ selected: step1.diabetes_history === opt.value }"
          >
            <input
              v-model="step1.diabetes_history"
              type="radio"
              :value="opt.value"
              class="sr-only"
            />
            <div class="option-icon-wrap" :class="{ selected: step1.diabetes_history === opt.value }">
              <i class="fa-solid" :class="opt.icon" aria-hidden="true"></i>
            </div>
            <div class="option-body">
              <span class="option-label">{{ opt.label }}</span>
              <span class="option-desc">{{ opt.desc }}</span>
            </div>
            <div class="option-check" aria-hidden="true">
              <i v-if="step1.diabetes_history === opt.value" class="fa-solid fa-check-circle"></i>
              <i v-else class="fa-regular fa-circle"></i>
            </div>
          </label>
        </div>

        <transition name="expand">
          <div v-if="showDiabetesType" class="sub-form">
            <label class="field-label" for="diabetes-type">糖尿病类型</label>
            <div class="select-wrap">
              <select id="diabetes-type" v-model="step1.diabetes_type" class="form-select">
                <option value="" disabled>请选择糖尿病类型</option>
                <option v-for="t in DIABETES_TYPE_OPTIONS" :key="t.value" :value="t.value">
                  {{ t.label }}
                </option>
              </select>
              <i class="fa-solid fa-chevron-down select-arrow" aria-hidden="true"></i>
            </div>
          </div>
        </transition>

        <div v-if="fieldError" class="field-error" role="alert">
          <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
          {{ fieldError }}
        </div>

        <div class="step-actions">
          <button class="btn-primary press" @click="goStep1Next">
            下一步
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
      </section>

      <!-- 步骤2：健康信息 -->
      <section v-show="currentStep === 2" class="step-panel" aria-labelledby="step2-title">
        <div class="step-header">
          <span class="step-badge">步骤 2/3</span>
          <h2 id="step2-title" class="step-title">请填写您的健康信息</h2>
          <p class="step-desc">数据仅用于风险评估，不会用于其他用途</p>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label class="field-label" for="risk-age">年龄 <span class="required">*</span></label>
            <div class="input-wrap">
              <i class="fa-solid fa-cake-candles input-icon" aria-hidden="true"></i>
              <input
                id="risk-age"
                v-model.number="step2.age"
                type="number"
                min="1"
                max="120"
                placeholder="请输入年龄"
                class="form-input"
              />
              <span class="input-unit">岁</span>
            </div>
          </div>

          <div class="form-group full">
            <label class="field-label">性别 <span class="required">*</span></label>
            <div class="chip-group" role="radiogroup" aria-label="性别">
              <label
                v-for="g in GENDER_OPTIONS"
                :key="g.value"
                class="chip-button press"
                :class="{ selected: step2.gender === g.value }"
              >
                <input v-model="step2.gender" type="radio" :value="g.value" class="sr-only" />
                <i class="fa-solid" :class="g.icon" aria-hidden="true"></i>
                <span>{{ g.label }}</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label class="field-label" for="risk-height">身高 <span class="required">*</span></label>
            <div class="input-wrap">
              <i class="fa-solid fa-ruler-vertical input-icon" aria-hidden="true"></i>
              <input
                id="risk-height"
                v-model.number="step2.height"
                type="number"
                min="50"
                max="250"
                step="0.1"
                placeholder="请输入身高"
                class="form-input"
              />
              <span class="input-unit">cm</span>
            </div>
          </div>

          <div class="form-group">
            <label class="field-label" for="risk-weight">体重 <span class="required">*</span></label>
            <div class="input-wrap">
              <i class="fa-solid fa-weight-scale input-icon" aria-hidden="true"></i>
              <input
                id="risk-weight"
                v-model.number="step2.weight"
                type="number"
                min="20"
                max="300"
                step="0.1"
                placeholder="请输入体重"
                class="form-input"
              />
              <span class="input-unit">kg</span>
            </div>
          </div>

          <div class="form-group">
            <label class="field-label" for="risk-waist">腰围 <span class="optional">(选填)</span></label>
            <div class="input-wrap">
              <i class="fa-solid fa-tape input-icon" aria-hidden="true"></i>
              <input
                id="risk-waist"
                v-model.number="step2.waist"
                type="number"
                min="30"
                max="200"
                step="0.1"
                placeholder="请输入腰围"
                class="form-input"
              />
              <span class="input-unit">cm</span>
            </div>
          </div>

          <div class="form-group">
            <label class="field-label" for="risk-bp">收缩压 <span class="optional">(选填)</span></label>
            <div class="input-wrap">
              <i class="fa-solid fa-heart-pulse input-icon" aria-hidden="true"></i>
              <input
                id="risk-bp"
                v-model.number="step2.systolic_bp"
                type="number"
                min="60"
                max="250"
                placeholder="请输入收缩压"
                class="form-input"
              />
              <span class="input-unit">mmHg</span>
            </div>
          </div>

          <div class="form-group full">
            <label class="field-label">家族糖尿病史 <span class="required">*</span></label>
            <div class="chip-group" role="radiogroup" aria-label="家族糖尿病史">
              <label
                v-for="f in FAMILY_HISTORY_OPTIONS"
                :key="f.value"
                class="chip-button press"
                :class="{ selected: step2.family_history === f.value }"
              >
                <input v-model="step2.family_history" type="radio" :value="f.value" class="sr-only" />
                <i class="fa-solid" :class="f.icon" aria-hidden="true"></i>
                <span>{{ f.label }}</span>
              </label>
            </div>
          </div>

          <transition name="expand">
            <div v-if="showPregnancy" class="form-group full">
              <label class="field-label">是否妊娠</label>
              <div class="chip-group" role="radiogroup" aria-label="是否妊娠">
                <label
                  class="chip-button press"
                  :class="{ selected: step2.pregnancy === true }"
                >
                  <input v-model="step2.pregnancy" type="radio" :value="true" class="sr-only" />
                  <span>是</span>
                </label>
                <label
                  class="chip-button press"
                  :class="{ selected: step2.pregnancy === false }"
                >
                  <input v-model="step2.pregnancy" type="radio" :value="false" class="sr-only" />
                  <span>否</span>
                </label>
              </div>
            </div>
          </transition>
        </div>

        <div v-if="fieldError" class="field-error" role="alert">
          <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
          {{ fieldError }}
        </div>

        <div class="step-actions split">
          <button class="btn-secondary press" @click="goStep2Prev">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
            上一步
          </button>
          <button
            class="btn-primary press"
            :disabled="submitting"
            @click="submitPredict"
          >
            <i v-if="submitting" class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
            <span>{{ submitting ? '提交中...' : '提交评估' }}</span>
          </button>
        </div>
      </section>

      <!-- 步骤3：评估结果 -->
      <section v-show="currentStep === 3" class="step-panel result-panel" aria-labelledby="step3-title">
        <h2 id="step3-title" class="sr-only">评估结果</h2>

        <!-- 加载中 -->
        <div v-if="loading" class="ai-loading">
          <div class="spinner-ring" aria-hidden="true">
            <div class="spinner-core"></div>
          </div>
          <p class="loading-title">正在分析您的健康数据...</p>
          <p class="loading-desc">AI 模型正在综合多项指标进行风险评估</p>
          <div class="progress-track">
            <div class="progress-bar"></div>
          </div>
        </div>

        <!-- 错误状态 -->
        <div v-else-if="error && !result" class="error-state" role="alert">
          <div class="error-icon">
            <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
          </div>
          <p class="error-title">评估失败</p>
          <p class="error-desc">{{ error }}</p>
          <button class="retry-button press" :disabled="retryCooldown" @click="retryPredict">
            <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
            {{ retryCooldown ? '请稍后重试...' : '重新评估' }}
          </button>
        </div>

        <!-- 结果展示 -->
        <template v-else-if="result && riskMeta">
          <div v-if="isHistoryFallback" class="fallback-banner" role="status">
            <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
            <span>AI 服务暂不可用，展示最近一次历史预测结果</span>
          </div>

          <div class="result-card">
            <div class="result-gauge" :style="{ '--gauge-color': riskMeta.color }">
              <div class="gauge-ring" aria-hidden="true">
                <div class="gauge-fill" :style="{ transform: `rotate(${riskPercent * 1.8}deg)` }"></div>
              </div>
              <div class="gauge-center">
                <span class="gauge-score">{{ Number(result.risk_score).toFixed(1) }}</span>
                <span class="gauge-total">/ 51</span>
              </div>
            </div>

            <div class="risk-level-badge" :style="{ color: riskMeta.color, background: riskMeta.bg }">
              <i class="fa-solid" :class="riskMeta.icon" aria-hidden="true"></i>
              {{ result.risk_level_label || riskMeta.label }}
            </div>

            <p class="result-hint">
              {{ result.risk_level === 'low' ? '继续保持健康生活方式' :
                 result.risk_level === 'medium' ? '建议关注血糖变化，定期复查' :
                 '建议尽快就医，进行专业诊断' }}
            </p>
          </div>

          <div class="advice-card">
            <div class="advice-header">
              <i class="fa-solid fa-user-doctor" aria-hidden="true"></i>
              <h3>风险分析与建议</h3>
            </div>
            <div class="markdown-body" v-html="safeAdviceHtml(result.advice)"></div>
          </div>

          <p class="disclaimer-text">
            本评估基于《中国2型糖尿病防治指南（2020版）》评分体系，仅供参考，不能替代专业医疗诊断。如有疑虑请及时就医。
          </p>

          <div class="step-actions split">
            <button class="btn-secondary press" @click="restart">
              <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
              重新填写
            </button>
            <button class="btn-primary press" @click="goToLifePlan">
              <i class="fa-solid fa-clipboard-list" aria-hidden="true"></i>
              生成生活方案
            </button>
          </div>
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* ========== 页面容器 ========== */
.risk-page {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--color-bg);
  padding-bottom: calc(var(--tab-bar-height) + 16px);
}

.risk-header {
  position: sticky;
  top: 0;
  z-index: 40;
  height: var(--header-height);
  background: var(--color-card);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  padding: 0 var(--spacing-lg);
}

.back-button {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: background var(--transition-fast);
}

.back-button:hover,
.back-button:focus {
  background: var(--color-primary-light);
}

.risk-title {
  flex: 1;
  text-align: center;
  font-size: var(--font-size-h3);
  font-weight: 600;
  color: var(--color-text-primary);
}

.header-spacer {
  width: 32px;
}

.risk-main {
  padding: var(--spacing-lg);
}

/* ========== 步骤进度 ========== */
.step-progress {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
  background: var(--color-card);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg) var(--spacing-md);
  margin-bottom: var(--spacing-lg);
  box-shadow: var(--shadow-sm);
}

.step-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  flex: 0 0 auto;
}

.step-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  background: #f0f0f0;
  color: var(--color-text-tertiary);
  border: 2px solid transparent;
  transition: all var(--transition-fast);
}

.step-node.active .step-circle {
  background: var(--color-primary);
  color: #fff;
}

.step-node.current .step-circle {
  box-shadow: 0 0 0 4px rgba(74, 144, 217, 0.18);
}

.step-label {
  font-size: 11px;
  color: var(--color-text-tertiary);
  transition: color var(--transition-fast);
}

.step-node.active .step-label {
  color: var(--color-primary);
  font-weight: 600;
}

.step-connector {
  width: 48px;
  height: 2px;
  background: #f0f0f0;
  margin-top: 15px;
  border-radius: 1px;
  transition: background var(--transition-fast);
}

.step-connector.active {
  background: var(--color-primary);
}

/* ========== 步骤面板 ========== */
.step-panel {
  animation: panelEnter 0.3s ease;
}

@keyframes panelEnter {
  from {
    opacity: 0;
    transform: translateX(16px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .step-panel {
    animation: none;
  }
}

.step-header {
  margin-bottom: var(--spacing-lg);
}

.step-badge {
  display: inline-flex;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary);
  background: var(--color-primary-light);
  margin-bottom: var(--spacing-sm);
}

.step-title {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.3;
  margin-bottom: var(--spacing-xs);
}

.step-desc {
  font-size: var(--font-size-caption);
  color: var(--color-text-tertiary);
}

/* ========== 选项卡片 ========== */
.option-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.option-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-card);
  border: 2px solid var(--color-divider);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.option-card:hover,
.option-card:focus-within {
  border-color: #bfdbfb;
}

.option-card.selected {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  box-shadow: 0 2px 8px rgba(74, 144, 217, 0.12);
}

.option-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  color: var(--color-text-secondary);
  font-size: 18px;
  flex-shrink: 0;
  transition: all var(--transition-fast);
}

.option-icon-wrap.selected {
  background: var(--color-primary);
  color: #fff;
}

.option-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-label {
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--color-text-primary);
}

.option-desc {
  font-size: var(--font-size-caption);
  color: var(--color-text-tertiary);
}

.option-check {
  font-size: 20px;
  color: var(--color-text-disabled);
  flex-shrink: 0;
}

.option-card.selected .option-check {
  color: var(--color-primary);
}

/* ========== 子表单 / 展开动画 ========== */
.sub-form {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-md);
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-8px);
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 200px;
  transform: translateY(0);
}

/* ========== 表单元素 ========== */
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-md);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-group.full {
  grid-column: 1 / -1;
}

.field-label {
  font-size: var(--font-size-body);
  font-weight: 500;
  color: var(--color-text-primary);
}

.required {
  color: var(--color-danger);
}

.optional {
  color: var(--color-text-tertiary);
  font-weight: 400;
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  color: var(--color-text-tertiary);
  font-size: 14px;
  pointer-events: none;
}

.form-input {
  width: 100%;
  height: 46px;
  padding: 0 50px 0 40px;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-full);
  background: var(--color-card);
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.form-input::placeholder {
  color: var(--color-text-disabled);
}

.form-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.12);
}

.input-unit {
  position: absolute;
  right: 14px;
  font-size: 12px;
  color: var(--color-text-tertiary);
  pointer-events: none;
}

.select-wrap {
  position: relative;
}

.form-select {
  width: 100%;
  height: 46px;
  padding: 0 40px 0 16px;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-full);
  background: var(--color-card);
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  outline: none;
  appearance: none;
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.form-select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.12);
}

.select-arrow {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-tertiary);
  font-size: 12px;
  pointer-events: none;
}

.chip-group {
  display: flex;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.chip-button {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 10px 20px;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-full);
  background: var(--color-card);
  color: var(--color-text-primary);
  font-size: var(--font-size-body);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.chip-button:hover,
.chip-button:focus-within {
  border-color: var(--color-primary);
}

.chip-button.selected {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
  box-shadow: 0 2px 8px rgba(74, 144, 217, 0.22);
}

/* ========== 错误提示 ========== */
.field-error {
  margin-top: var(--spacing-md);
  padding: 10px 14px;
  background: #fff1f0;
  border: 1px solid #ffccc7;
  border-radius: var(--radius-md);
  color: var(--color-danger);
  font-size: var(--font-size-caption);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  animation: shake 0.3s ease;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

/* ========== 操作按钮 ========== */
.step-actions {
  margin-top: var(--spacing-xl);
}

.step-actions.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
}

.btn-primary,
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  width: 100%;
  height: 48px;
  border-radius: var(--radius-button);
  font-size: var(--font-size-body);
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast);
}

.btn-primary {
  background: var(--color-primary);
  color: #fff;
  box-shadow: 0 4px 12px rgba(74, 144, 217, 0.25);
}

.btn-primary:hover,
.btn-primary:focus {
  background: var(--color-primary-dark);
  box-shadow: 0 6px 16px rgba(74, 144, 217, 0.32);
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--color-card);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.btn-secondary:hover,
.btn-secondary:focus {
  background: var(--color-primary-light);
}

.press:active {
  transform: scale(0.97);
}

/* ========== 加载中 ========== */
.ai-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl) var(--spacing-lg);
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  text-align: center;
}

.spinner-ring {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: conic-gradient(var(--color-primary) 0%, var(--color-primary-light) 100%);
  animation: spin 1.2s linear infinite;
  margin-bottom: var(--spacing-lg);
}

.spinner-core {
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: var(--color-card);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.loading-title {
  font-size: var(--font-size-h3);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
}

.loading-desc {
  font-size: var(--font-size-caption);
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-xl);
}

.progress-track {
  width: 220px;
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  width: 20%;
  background: var(--color-primary);
  border-radius: 3px;
  animation: progressFlow 2s ease-in-out infinite;
}

@keyframes progressFlow {
  0% { width: 10%; opacity: 0.6; }
  50% { width: 70%; opacity: 1; }
  100% { width: 95%; opacity: 0.8; }
}

@media (prefers-reduced-motion: reduce) {
  .spinner-ring,
  .progress-bar {
    animation: none;
  }
}

/* ========== 错误状态 ========== */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl) var(--spacing-lg);
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  text-align: center;
}

.error-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #fff1f0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-md);
}

.error-icon i {
  font-size: 28px;
  color: var(--color-danger);
}

.error-title {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
}

.error-desc {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xl);
  max-width: 280px;
}

.retry-button {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 10px 24px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-button);
  font-size: var(--font-size-body);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.retry-button:hover,
.retry-button:focus {
  background: var(--color-primary-dark);
}

.retry-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ========== 历史回退提示 ========== */
.fallback-banner {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 10px 14px;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: var(--radius-md);
  color: #d48806;
  font-size: var(--font-size-caption);
  margin-bottom: var(--spacing-md);
}

/* ========== 结果卡片 ========== */
.result-card {
  background: var(--color-card);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  box-shadow: var(--shadow-sm);
  text-align: center;
  margin-bottom: var(--spacing-md);
}

.result-gauge {
  position: relative;
  width: 160px;
  height: 90px;
  margin: 0 auto var(--spacing-md);
  --gauge-color: var(--color-primary);
}

.gauge-ring {
  position: absolute;
  inset: 0;
  border-radius: 160px 160px 0 0;
  background: conic-gradient(from 180deg at 50% 100%, var(--gauge-color) 0deg, #f0f0f0 0deg);
  mask: radial-gradient(at 50% 100%, transparent 55%, #000 56%);
  -webkit-mask: radial-gradient(at 50% 100%, transparent 55%, #000 56%);
  transform: rotate(-180deg);
}

.gauge-fill {
  position: absolute;
  inset: 0;
  border-radius: 160px 160px 0 0;
  background: conic-gradient(from 180deg at 50% 100%, var(--gauge-color) var(--angle, 0deg), #f0f0f0 0deg);
  transform-origin: 50% 100%;
  --angle: 180deg;
}

.gauge-center {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
}

.gauge-score {
  font-size: 42px;
  font-weight: 800;
  color: var(--color-text-primary);
  line-height: 1;
}

.gauge-total {
  font-size: 14px;
  color: var(--color-text-tertiary);
}

.risk-level-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 6px 16px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-h4);
  font-weight: 700;
}

.result-hint {
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
}

/* ========== 建议卡片 ========== */
.advice-card {
  background: var(--color-card);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-sm);
  margin-bottom: var(--spacing-md);
}

.advice-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid var(--color-divider);
}

.advice-header i {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--color-primary-light);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.advice-header h3 {
  font-size: var(--font-size-h3);
  font-weight: 700;
  color: var(--color-text-primary);
}

.markdown-body {
  font-size: var(--font-size-body);
  line-height: 1.75;
  color: var(--color-text-secondary);
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  color: var(--color-text-primary);
  margin: var(--spacing-md) 0 var(--spacing-xs);
  font-weight: 600;
}

.markdown-body :deep(p) {
  margin-bottom: var(--spacing-sm);
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: var(--spacing-lg);
  margin-bottom: var(--spacing-sm);
}

.markdown-body :deep(li) {
  margin-bottom: var(--spacing-xs);
}

.markdown-body :deep(strong) {
  color: var(--color-text-primary);
}

.disclaimer-text {
  font-size: 11px;
  color: var(--color-text-tertiary);
  text-align: center;
  line-height: 1.6;
  padding: 0 var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

/* ========== 辅助类 ========== */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
