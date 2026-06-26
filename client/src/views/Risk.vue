<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRiskFormStore } from '@/stores/riskFormStore'
import { api } from '@/composables/useApi'
import type { RiskPredictRequest, RiskPredictResponse } from '@/types/api'

const router = useRouter()
const store = useRiskFormStore()

const currentStep = ref<1 | 2 | 3>(1)
const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<RiskPredictResponse | null>(null)

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

const showDiabetesType = computed(() => step1.diabetes_history === 'diagnosed')
const showPregnancy = computed(() => step2.gender === 'female')

onMounted(() => {
  const restored = store.loadFromStorage()
  if (restored) {
    currentStep.value = store.currentStep
    if (store.formData.diabetes_history) step1.diabetes_history = store.formData.diabetes_history
    if (store.formData.diabetes_type) step1.diabetes_type = store.formData.diabetes_type
    if (store.formData.age) step2.age = store.formData.age
    if (store.formData.gender) step2.gender = store.formData.gender
    if (store.formData.height) step2.height = store.formData.height
    if (store.formData.weight) step2.weight = store.formData.weight
    if (store.formData.waist) step2.waist = store.formData.waist
    if (store.formData.systolic_bp) step2.systolic_bp = store.formData.systolic_bp
    if (store.formData.family_history) step2.family_history = store.formData.family_history
    if (store.formData.pregnancy) step2.pregnancy = store.formData.pregnancy
  }
})

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
  if (!step2.age || step2.age < 1 || step2.age > 120) {
    fieldError.value = '请输入有效年龄（1-120）'
    return false
  }
  if (!step2.gender) {
    fieldError.value = '请选择性别'
    return false
  }
  if (!step2.height || step2.height < 50 || step2.height > 250) {
    fieldError.value = '请输入有效身高（50-250 cm）'
    return false
  }
  if (!step2.weight || step2.weight < 20 || step2.weight > 300) {
    fieldError.value = '请输入有效体重（20-300 kg）'
    return false
  }
  if (step2.waist !== null && step2.waist === 0) {
    fieldError.value = '腰围不能为 0，请填写有效值或留空'
    return false
  }
  if (step2.systolic_bp !== null && step2.systolic_bp === 0) {
    fieldError.value = '收缩压不能为 0，请填写有效值或留空'
    return false
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
    diabetes_type: step1.diabetes_type as RiskPredictRequest['diabetes_type'] || undefined,
  })
  currentStep.value = 2
}

function goStep2Prev() {
  currentStep.value = 1
}

async function submitPredict() {
  if (!validateStep2()) return

  const payload: RiskPredictRequest = {
    diabetes_history: step1.diabetes_history as RiskPredictRequest['diabetes_history'],
    diabetes_type: (step1.diabetes_type || undefined) as RiskPredictRequest['diabetes_type'],
    age: step2.age!,
    gender: step2.gender as RiskPredictRequest['gender'],
    height: step2.height!,
    weight: step2.weight!,
    waist: step2.waist ?? undefined,
    systolic_bp: step2.systolic_bp ?? undefined,
    family_history: step2.family_history as RiskPredictRequest['family_history'],
    pregnancy: step2.gender === 'female' ? step2.pregnancy : undefined,
  }

  store.saveStep(3, payload)
  currentStep.value = 3
  loading.value = true
  error.value = null

  try {
    const res = await api.post<{ success: boolean; data: RiskPredictResponse }>('/risk/predict', payload)
    result.value = res.data.data
    store.saveResult(res.data.data)
    // 提交成功清除 sessionStorage
    store.reset()
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message || '预测失败，请稍后重试'
    error.value = msg
    // 尝试读取历史缓存
    try {
      const historyRes = await api.get<{ success: boolean; data: any[]; pagination: any }>('/risk/history', {
        params: { page: 1, pageSize: 1 },
      })
      if (historyRes.data.data?.length > 0) {
        result.value = historyRes.data.data[0] as RiskPredictResponse
      }
    } catch { /* 无历史数据 */ }
  } finally {
    loading.value = false
  }
}

function restart() {
  result.value = null
  error.value = null
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
  router.push({ path: '/life-plan', query: { riskLevel: result.value?.risk_level, diabetesType: result.value?.matched_diabetes_type } })
}
</script>

<template>
  <div class="risk-container min-h-screen bg-[#F5F5F5]">
    <!-- 顶部导航 -->
    <header class="top-bar sticky top-0 z-40 bg-white shadow-sm flex items-center h-12 px-4">
      <button class="text-[#4A90D9]" @click="router.back()">
        <i class="fas fa-arrow-left"></i>
      </button>
      <h1 class="flex-1 text-center text-base font-medium">糖尿病风险预测</h1>
      <div class="w-6"></div>
    </header>

    <!-- 步骤指示器 -->
    <div class="step-progress flex items-center justify-center px-8 py-5 bg-white">
      <template v-for="step in 3" :key="step">
        <div class="flex flex-col items-center">
          <div
            class="step-circle w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition"
            :class="currentStep >= step
              ? 'bg-[#4A90D9] text-white'
              : 'bg-gray-200 text-gray-500'"
          >
            {{ step }}
          </div>
          <span class="text-xs mt-1" :class="currentStep >= step ? 'text-[#4A90D9]' : 'text-gray-400'">
            {{ ['病史状态', '健康信息', '评估结果'][step - 1] }}
          </span>
        </div>
        <div
          v-if="step < 3"
          class="step-connector w-12 h-0.5 mx-2 transition"
          :class="currentStep > step ? 'bg-[#4A90D9]' : 'bg-gray-200'"
        ></div>
      </template>
    </div>

    <!-- 步骤1：病史状态 -->
    <div v-show="currentStep === 1" class="step-content px-4 pt-6">
      <h2 class="text-lg font-medium text-[#333] mb-5">您的糖尿病病史状态是？</h2>
      <div class="option-group space-y-3">
        <label
          v-for="opt in [
            { value: 'healthy', label: '健康 (无糖尿病)' },
            { value: 'prediabetes', label: '糖尿病前期' },
            { value: 'diagnosed', label: '已确诊糖尿病' },
          ]"
          :key="opt.value"
          class="option-card flex items-center px-4 py-3.5 bg-white rounded-xl border-2 cursor-pointer transition"
          :class="step1.diabetes_history === opt.value
            ? 'border-[#4A90D9] bg-[#E8F1FB]'
            : 'border-gray-200 hover:border-gray-300'"
        >
          <input
            type="radio"
            :value="opt.value"
            v-model="step1.diabetes_history"
            class="sr-only"
          />
          <i
            class="fas mr-3"
            :class="step1.diabetes_history === opt.value
              ? 'fa-check-circle text-[#4A90D9]'
              : 'fa-circle text-gray-300'"
          ></i>
          <span class="text-sm">{{ opt.label }}</span>
        </label>
      </div>

      <div v-if="showDiabetesType" class="mt-4">
        <label class="text-sm text-[#666] mb-2 block">糖尿病类型</label>
        <select
          v-model="step1.diabetes_type"
          class="w-full bg-gray-100 rounded-full px-4 py-2.5 outline-none text-sm focus:ring-2 focus:ring-[#4A90D9] appearance-none"
        >
          <option value="" disabled>请选择</option>
          <option value="type1">1型糖尿病</option>
          <option value="type2">2型糖尿病</option>
          <option value="gestational">妊娠期糖尿病</option>
          <option value="other">其他特殊类型</option>
        </select>
      </div>

      <div v-if="fieldError" class="field-error text-[#FF4D4F] text-xs mt-3">{{ fieldError }}</div>

      <div class="step-actions mt-8">
        <button class="btn-primary w-full bg-[#4A90D9] text-white py-3 rounded-xl font-medium hover:bg-[#3A7BC8] transition" @click="goStep1Next">
          下一步
        </button>
      </div>
    </div>

    <!-- 步骤2：健康信息 -->
    <div v-show="currentStep === 2" class="step-content px-4 pt-6">
      <h2 class="text-lg font-medium text-[#333] mb-5">请填写您的健康信息</h2>

      <div class="space-y-4">
        <div class="form-group">
          <label class="text-sm text-[#666] block mb-1.5">年龄 <span class="text-[#FF4D4F]">*</span></label>
          <input
            v-model.number="step2.age"
            type="number"
            min="1"
            max="120"
            placeholder="请输入年龄"
            class="w-full bg-gray-100 rounded-full px-4 py-2.5 outline-none text-sm focus:ring-2 focus:ring-[#4A90D9]"
          />
        </div>

        <div class="form-group">
          <label class="text-sm text-[#666] block mb-1.5">性别 <span class="text-[#FF4D4F]">*</span></label>
          <div class="radio-group flex gap-4">
            <label
              v-for="g in [{ value: 'male', label: '男' }, { value: 'female', label: '女' }]"
              :key="g.value"
              class="flex items-center cursor-pointer"
            >
              <input type="radio" :value="g.value" v-model="step2.gender" class="sr-only" />
              <i
                class="fas mr-1.5"
                :class="step2.gender === g.value ? 'fa-dot-circle text-[#4A90D9]' : 'fa-circle text-gray-300'"
              ></i>
              <span class="text-sm">{{ g.label }}</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label class="text-sm text-[#666] block mb-1.5">身高 (cm) <span class="text-[#FF4D4F]">*</span></label>
          <input
            v-model.number="step2.height"
            type="number"
            min="50"
            max="250"
            step="0.1"
            placeholder="请输入身高"
            class="w-full bg-gray-100 rounded-full px-4 py-2.5 outline-none text-sm focus:ring-2 focus:ring-[#4A90D9]"
          />
        </div>

        <div class="form-group">
          <label class="text-sm text-[#666] block mb-1.5">体重 (kg) <span class="text-[#FF4D4F]">*</span></label>
          <input
            v-model.number="step2.weight"
            type="number"
            min="20"
            max="300"
            step="0.1"
            placeholder="请输入体重"
            class="w-full bg-gray-100 rounded-full px-4 py-2.5 outline-none text-sm focus:ring-2 focus:ring-[#4A90D9]"
          />
        </div>

        <div class="form-group">
          <label class="text-sm text-[#666] block mb-1.5">腰围 (cm) <span class="text-gray-400">(选填)</span></label>
          <input
            v-model.number="step2.waist"
            type="number"
            min="30"
            max="200"
            step="0.1"
            placeholder="请输入腰围（选填）"
            class="w-full bg-gray-100 rounded-full px-4 py-2.5 outline-none text-sm focus:ring-2 focus:ring-[#4A90D9]"
          />
        </div>

        <div class="form-group">
          <label class="text-sm text-[#666] block mb-1.5">收缩压 (mmHg) <span class="text-gray-400">(选填)</span></label>
          <input
            v-model.number="step2.systolic_bp"
            type="number"
            min="60"
            max="250"
            placeholder="请输入收缩压（选填）"
            class="w-full bg-gray-100 rounded-full px-4 py-2.5 outline-none text-sm focus:ring-2 focus:ring-[#4A90D9]"
          />
        </div>

        <div class="form-group">
          <label class="text-sm text-[#666] block mb-1.5">家族糖尿病史 <span class="text-[#FF4D4F]">*</span></label>
          <div class="radio-group flex gap-4">
            <label
              v-for="f in [{ value: 'yes', label: '有' }, { value: 'no', label: '无' }]"
              :key="f.value"
              class="flex items-center cursor-pointer"
            >
              <input type="radio" :value="f.value" v-model="step2.family_history" class="sr-only" />
              <i
                class="fas mr-1.5"
                :class="step2.family_history === f.value ? 'fa-dot-circle text-[#4A90D9]' : 'fa-circle text-gray-300'"
              ></i>
              <span class="text-sm">{{ f.label }}</span>
            </label>
          </div>
        </div>

        <div v-if="showPregnancy" class="form-group">
          <label class="text-sm text-[#666] block mb-1.5">是否妊娠</label>
          <div class="radio-group flex gap-4">
            <label class="flex items-center cursor-pointer">
              <input type="radio" :value="true" v-model="step2.pregnancy" class="sr-only" />
              <i
                class="fas mr-1.5"
                :class="step2.pregnancy === true ? 'fa-dot-circle text-[#4A90D9]' : 'fa-circle text-gray-300'"
              ></i>
              <span class="text-sm">是</span>
            </label>
            <label class="flex items-center cursor-pointer">
              <input type="radio" :value="false" v-model="step2.pregnancy" class="sr-only" />
              <i
                class="fas mr-1.5"
                :class="step2.pregnancy === false ? 'fa-dot-circle text-[#4A90D9]' : 'fa-circle text-gray-300'"
              ></i>
              <span class="text-sm">否</span>
            </label>
          </div>
        </div>
      </div>

      <div v-if="fieldError" class="field-error text-[#FF4D4F] text-xs mt-3">{{ fieldError }}</div>

      <div class="step-actions flex gap-3 mt-8">
        <button class="btn-secondary flex-1 border border-[#4A90D9] text-[#4A90D9] py-3 rounded-xl font-medium hover:bg-[#E8F1FB] transition" @click="goStep2Prev">
          上一步
        </button>
        <button class="btn-primary flex-1 bg-[#4A90D9] text-white py-3 rounded-xl font-medium hover:bg-[#3A7BC8] transition" @click="submitPredict">
          提交评估
        </button>
      </div>
    </div>

    <!-- 步骤3：结果 -->
    <div v-show="currentStep === 3" class="step-content px-4 pt-6">
      <!-- 加载态 -->
      <div v-if="loading" class="ai-loading flex flex-col items-center justify-center py-16">
        <div class="w-10 h-10 border-4 border-[#E8F1FB] border-t-[#4A90D9] rounded-full animate-spin mb-4"></div>
        <p class="text-sm text-gray-500 mb-3">正在分析您的健康数据...</p>
        <div class="w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div class="h-full bg-[#4A90D9] rounded-full animate-progress"></div>
        </div>
      </div>

      <!-- 错误态 -->
      <div v-else-if="error && !result" class="flex flex-col items-center justify-center py-16">
        <i class="fas fa-exclamation-circle text-4xl text-[#FF4D4F] mb-4"></i>
        <p class="text-sm text-gray-600 mb-4">{{ error }}</p>
        <button class="bg-[#4A90D9] text-white px-6 py-2 rounded-xl font-medium" @click="submitPredict">重试</button>
      </div>

      <!-- 结果展示 -->
      <template v-else-if="result">
        <!-- 历史降级提示 -->
        <div v-if="error" class="bg-[#FFF7E6] border border-[#FAAD14] text-[#FAAD14] text-xs px-3 py-2 rounded-lg mb-4">
          <i class="fas fa-info-circle mr-1"></i>AI 服务暂不可用，展示最近一次历史预测结果
        </div>

        <div class="result-header bg-white rounded-xl shadow-sm p-6 text-center">
          <div
            class="risk-level-badge inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium mb-3"
            :class="{
              'bg-red-50 text-[#FF4D4F]': result.risk_level === 'high',
              'bg-yellow-50 text-[#FAAD14]': result.risk_level === 'medium',
              'bg-green-50 text-[#52C41A]': result.risk_level === 'low',
            }"
          >
            {{ result.risk_level_label }}
          </div>
          <div class="risk-score text-4xl font-bold text-[#333]">
            {{ result.risk_score }}<span class="text-base text-gray-400 font-normal"> / 51 分</span>
          </div>
        </div>

        <div class="result-detail bg-white rounded-xl shadow-sm p-6 mt-3">
          <h3 class="text-base font-medium text-[#333] mb-2">风险分析</h3>
          <div class="text-sm text-[#666] leading-relaxed markdown-body" v-html="result.advice.replace(/\n/g, '<br>')"></div>
        </div>

        <p class="disclaimer-text text-xs text-gray-400 text-center mt-4 px-4">
          本评估基于《中国2型糖尿病防治指南（2020版）》评分体系，仅供参考，不能替代专业医疗诊断。如有疑虑请及时就医。
        </p>

        <div class="step-actions flex gap-3 mt-6">
          <button class="btn-secondary flex-1 border border-[#4A90D9] text-[#4A90D9] py-3 rounded-xl font-medium hover:bg-[#E8F1FB] transition" @click="restart">
            重新填写
          </button>
          <button class="btn-primary flex-1 bg-[#4A90D9] text-white py-3 rounded-xl font-medium hover:bg-[#3A7BC8] transition" @click="goToLifePlan">
            去生成生活方案
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.step-content {
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes progress {
  0% { width: 10%; }
  50% { width: 60%; }
  100% { width: 90%; }
}

.animate-progress {
  animation: progress 15s ease-out forwards;
}

.field-error {
  animation: shake 0.3s ease;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
</style>
