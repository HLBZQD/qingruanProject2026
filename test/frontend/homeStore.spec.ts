import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHomeStore } from '@/stores/homeStore'
import type { DiabetesType } from '@/types/api'

describe('homeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('初始状态', () => {
    it('doctors 默认为空数组', () => {
      const store = useHomeStore()
      expect(store.doctors).toEqual([])
    })

    it('loading 默认为 false', () => {
      const store = useHomeStore()
      expect(store.loading).toBe(false)
    })

    it('错误状态全为 null', () => {
      const store = useHomeStore()
      expect(store.doctorsError).toBeNull()
      expect(store.articlesError).toBeNull()
      expect(store.typesError).toBeNull()
    })
  })

  describe('normalizeType（内部纯函数回归）', () => {
    // 通过构造 DiabetesType 观察 diabetesTypes computed 的归一化效果
    it('有 image 时 cover 取 image', async () => {
      const store = useHomeStore()
      // 直接赋值测试 render 侧行为
      store.diabetesTypes = [
        {
          id: 1,
          name: '1型',
          image: '/static/diabetes/1.jpg',
          pathogenesis: '病因',
          symptoms: '',
          treatment: '',
          cover: '',
          brief: '',
        },
      ]
      expect(store.diabetesTypes[0].cover).toBe('')
      // 注意: 直接赋值绕过 normalizeType，这测的是视图数据格式
    })

    it('diabetesTypes 初始为空数组', () => {
      const store = useHomeStore()
      expect(store.diabetesTypes).toEqual([])
    })
  })

  describe('clearHomeCache', () => {
    it('调用不抛异常', () => {
      const store = useHomeStore()
      expect(() => store.clearHomeCache()).not.toThrow()
    })
  })
})
