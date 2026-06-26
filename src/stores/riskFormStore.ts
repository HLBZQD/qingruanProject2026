import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RiskPredictRequest, RiskPredictResponse } from '@/types/api'

const STORAGE_KEY = 'risk_form_data'

function validateStep(raw: unknown): 1 | 2 | 3 {
  if (raw === 1 || raw === 2 || raw === 3) return raw
  return 1
}

export const useRiskFormStore = defineStore('riskForm', () => {
  const currentStep = ref<1 | 2 | 3>(1)
  const formData = ref<Partial<RiskPredictRequest>>({})
  const result = ref<RiskPredictResponse | null>(null)

  function saveStep(step: number, data: Partial<RiskPredictRequest>) {
    currentStep.value = validateStep(step)
    formData.value = { ...formData.value, ...data }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      currentStep: currentStep.value,
      formData: formData.value,
      result: result.value,
    }))
  }

  function saveResult(res: RiskPredictResponse) {
    result.value = res
    // 持久化 result 到 sessionStorage，防止刷新丢失
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const data = raw ? JSON.parse(raw) : {}
    data.result = res
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  function isValidResult(r: unknown): r is RiskPredictResponse {
    if (!r || typeof r !== 'object') return false
    const obj = r as Record<string, unknown>
    return typeof obj.record_id === 'number'
      && typeof obj.risk_score === 'number'
      && typeof obj.risk_level === 'string'
      && ['low', 'medium', 'high'].includes(obj.risk_level as string)
  }

  function loadFromStorage(): boolean {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed !== 'object' || !parsed) return false
      currentStep.value = validateStep(parsed.currentStep)
      if (parsed.formData && typeof parsed.formData === 'object') {
        const fd: Record<string, unknown> = {}
        const allowedKeys = ['diabetes_history', 'diabetes_type', 'age', 'gender', 'height', 'weight', 'waist', 'systolic_bp', 'family_history', 'pregnancy']
        for (const key of allowedKeys) {
          if (key in parsed.formData) fd[key] = (parsed.formData as Record<string, unknown>)[key]
        }
        formData.value = fd as Partial<RiskPredictRequest>
      } else {
        formData.value = {}
      }
      if (parsed.result && typeof parsed.result === 'object' && isValidResult(parsed.result)) {
        result.value = parsed.result
      } else {
        result.value = null
      }
      return true
    } catch {
      return false
    }
  }

  function clearSession() {
    sessionStorage.removeItem(STORAGE_KEY)
  }

  function reset() {
    currentStep.value = 1
    formData.value = {}
    result.value = null
    clearSession()
  }

  return { currentStep, formData, result, saveStep, saveResult, loadFromStorage, clearSession, reset }
})
