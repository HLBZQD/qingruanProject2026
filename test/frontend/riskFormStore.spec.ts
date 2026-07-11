import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRiskFormStore } from '@/stores/riskFormStore'

// Mock sessionStorage
const sessionStore: Record<string, string> = {}
vi.stubGlobal('sessionStorage', {
  getItem: vi.fn((key: string) => sessionStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { sessionStore[key] = value }),
  removeItem: vi.fn((key: string) => { delete sessionStore[key] }),
})

describe('riskFormStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.keys(sessionStore).forEach(k => delete sessionStore[k])
    vi.clearAllMocks()
  })

  describe('初始状态', () => {
    it('currentStep 默认为 1', () => {
      const store = useRiskFormStore()
      expect(store.currentStep).toBe(1)
    })

    it('formData 默认为空对象', () => {
      const store = useRiskFormStore()
      expect(store.formData).toEqual({})
    })

    it('result 默认为 null', () => {
      const store = useRiskFormStore()
      expect(store.result).toBeNull()
    })
  })

  describe('saveStep', () => {
    it('保存第一步数据并更新 currentStep', () => {
      const store = useRiskFormStore()
      store.saveStep(1, { age: 45, gender: 'male' })
      expect(store.currentStep).toBe(1)
      expect(store.formData.age).toBe(45)
    })

    it('保存第二步数据时合并已有数据', () => {
      const store = useRiskFormStore()
      store.saveStep(1, { age: 45, gender: 'male' })
      store.saveStep(2, { height: 170, weight: 70 })
      expect(store.currentStep).toBe(2)
      expect(store.formData.age).toBe(45)
      expect(store.formData.height).toBe(170)
    })

    it('非法 step 值回退为 1', () => {
      const store = useRiskFormStore()
      store.saveStep(99 as unknown as number, { age: 30 })
      expect(store.currentStep).toBe(1)
    })

    it('数据持久化到 sessionStorage', () => {
      const store = useRiskFormStore()
      store.saveStep(1, { age: 45, gender: 'male' })
      expect(sessionStorage.setItem).toHaveBeenCalled()
      const raw = JSON.parse(sessionStore['risk_form_data'])
      expect(raw.currentStep).toBe(1)
      expect(raw.formData.age).toBe(45)
    })
  })

  describe('saveResult', () => {
    it('保存预测结果并持久化', () => {
      const store = useRiskFormStore()
      const result = { record_id: 1, risk_score: 25, risk_level: 'high' as const, report: '高风险', recommendations: [] }
      store.saveResult(result)
      expect(store.result).toEqual(result)
      expect(sessionStorage.setItem).toHaveBeenCalled()
    })
  })

  describe('loadFromStorage', () => {
    it('sessionStorage 无数据返回 false', () => {
      const store = useRiskFormStore()
      expect(store.loadFromStorage()).toBe(false)
    })

    it('sessionStorage 有合法数据返回 true 并恢复状态', () => {
      sessionStore['risk_form_data'] = JSON.stringify({
        currentStep: 2,
        formData: { age: 45, gender: 'male', height: 170 },
      })
      const store = useRiskFormStore()
      expect(store.loadFromStorage()).toBe(true)
      expect(store.currentStep).toBe(2)
      expect(store.formData.age).toBe(45)
    })

    it('sessionStorage 数据损坏返回 false', () => {
      sessionStore['risk_form_data'] = 'not-json'
      const store = useRiskFormStore()
      expect(store.loadFromStorage()).toBe(false)
    })

    it('枚举字段值不在允许集合时被静默丢弃', () => {
      sessionStore['risk_form_data'] = JSON.stringify({
        currentStep: 1,
        formData: { age: 45, gender: 'unknown_invalid_value', height: 170 },
      })
      const store = useRiskFormStore()
      expect(store.loadFromStorage()).toBe(true)
      expect(store.formData.age).toBe(45)
      expect(store.formData.gender).toBeUndefined()
      expect(store.formData.height).toBe(170)
    })

    it('数字字段非数字时被静默丢弃', () => {
      sessionStore['risk_form_data'] = JSON.stringify({
        currentStep: 1,
        formData: { age: 'not-a-number', gender: 'male' },
      })
      const store = useRiskFormStore()
      expect(store.loadFromStorage()).toBe(true)
      expect(store.formData.age).toBeUndefined()
      expect(store.formData.gender).toBe('male')
    })

    it('恢复含 result 的数据', () => {
      sessionStore['risk_form_data'] = JSON.stringify({
        currentStep: 3,
        formData: {},
        result: { record_id: 1, risk_score: 25, risk_level: 'high' },
      })
      const store = useRiskFormStore()
      expect(store.loadFromStorage()).toBe(true)
      expect(store.result?.risk_level).toBe('high')
    })
  })

  describe('reset', () => {
    it('重置所有状态为初始值', () => {
      const store = useRiskFormStore()
      store.saveStep(2, { age: 45, gender: 'male' })
      store.reset()
      expect(store.currentStep).toBe(1)
      expect(store.formData).toEqual({})
      expect(store.result).toBeNull()
    })
  })
})
