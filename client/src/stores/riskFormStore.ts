import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RiskPredictRequest, RiskPredictResponse } from '@/types/api'

const STORAGE_KEY = 'risk_form_data'

export const useRiskFormStore = defineStore('riskForm', () => {
  const currentStep = ref<1 | 2 | 3>(1)
  const formData = ref<Partial<RiskPredictRequest>>({})
  const result = ref<RiskPredictResponse | null>(null)

  function saveStep(step: number, data: Partial<RiskPredictRequest>) {
    currentStep.value = step as 1 | 2 | 3
    formData.value = { ...formData.value, ...data }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      currentStep: currentStep.value,
      formData: formData.value,
    }))
  }

  function saveResult(res: RiskPredictResponse) {
    result.value = res
  }

  function loadFromStorage() {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    try {
      const parsed = JSON.parse(raw)
      currentStep.value = parsed.currentStep || 1
      formData.value = parsed.formData || {}
      return true
    } catch {
      return false
    }
  }

  function reset() {
    currentStep.value = 1
    formData.value = {}
    result.value = null
    sessionStorage.removeItem(STORAGE_KEY)
  }

  return { currentStep, formData, result, saveStep, saveResult, loadFromStorage, reset }
})
