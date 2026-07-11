import { describe, it, expect } from 'vitest'
import { enumLabel } from '@/utils/enumLabels'

describe('enumLabel', () => {
  describe('gender 性别', () => {
    it('male → 男', () => expect(enumLabel('gender', 'male')).toBe('男'))
    it('female → 女', () => expect(enumLabel('gender', 'female')).toBe('女'))
    it('unknown → 原样返回', () => expect(enumLabel('gender', 'other')).toBe('other'))
  })

  describe('family_history 家族史', () => {
    it('yes → 有', () => expect(enumLabel('family_history', 'yes')).toBe('有'))
    it('no → 无', () => expect(enumLabel('family_history', 'no')).toBe('无'))
  })

  describe('diabetes_history 糖尿病史', () => {
    it('healthy → 健康', () => expect(enumLabel('diabetes_history', 'healthy')).toBe('健康'))
    it('prediabetes → 糖尿病前期', () => expect(enumLabel('diabetes_history', 'prediabetes')).toBe('糖尿病前期'))
    it('diagnosed → 已确诊', () => expect(enumLabel('diabetes_history', 'diagnosed')).toBe('已确诊'))
  })

  describe('diabetes_type 糖尿病类型', () => {
    it('type1 → 1型糖尿病', () => expect(enumLabel('diabetes_type', 'type1')).toBe('1型糖尿病'))
    it('type2 → 2型糖尿病', () => expect(enumLabel('diabetes_type', 'type2')).toBe('2型糖尿病'))
    it('gestational → 妊娠期糖尿病', () => expect(enumLabel('diabetes_type', 'gestational')).toBe('妊娠期糖尿病'))
    it('other → 其他特殊类型', () => expect(enumLabel('diabetes_type', 'other')).toBe('其他特殊类型'))
  })

  describe('risk_level 风险等级', () => {
    it('low → 低风险', () => expect(enumLabel('risk_level', 'low')).toBe('低风险'))
    it('medium → 中风险', () => expect(enumLabel('risk_level', 'medium')).toBe('中风险'))
    it('high → 高风险', () => expect(enumLabel('risk_level', 'high')).toBe('高风险'))
  })

  describe('plan_type 方案类型', () => {
    it('diet → 饮食', () => expect(enumLabel('plan_type', 'diet')).toBe('饮食'))
    it('exercise → 运动', () => expect(enumLabel('plan_type', 'exercise')).toBe('运动'))
    it('other → 其他', () => expect(enumLabel('plan_type', 'other')).toBe('其他'))
  })

  describe('punch_type 打卡类型', () => {
    it('diet → 饮食', () => expect(enumLabel('punch_type', 'diet')).toBe('饮食'))
    it('exercise → 运动', () => expect(enumLabel('punch_type', 'exercise')).toBe('运动'))
  })

  describe('completion_status 完成状态', () => {
    it('completed → 已完成', () => expect(enumLabel('completion_status', 'completed')).toBe('已完成'))
    it('uncompleted → 未完成', () => expect(enumLabel('completion_status', 'uncompleted')).toBe('未完成'))
  })

  describe('边界情况', () => {
    it('未知 category 原样返回 value', () => {
      expect(enumLabel('unknown_category', 'some_value')).toBe('some_value')
    })

    it('未知 value 原样返回', () => {
      expect(enumLabel('gender', 'unknown_gender')).toBe('unknown_gender')
    })

    it('空字符串 category', () => {
      expect(enumLabel('', 'test')).toBe('test')
    })

    it('空字符串 value', () => {
      expect(enumLabel('gender', '')).toBe('')
    })
  })
})
