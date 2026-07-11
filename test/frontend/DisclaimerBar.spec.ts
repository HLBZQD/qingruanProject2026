import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DisclaimerBar from '@/components/DisclaimerBar.vue'

describe('DisclaimerBar.vue', () => {
  it('使用默认免责文案渲染', () => {
    const wrapper = mount(DisclaimerBar)
    const text = wrapper.find('.disclaimer-text').text()
    expect(text).toContain('AI 健康建议')
    expect(text).toContain('不能替代专业医疗诊断')
  })

  it('自定义文案渲染', () => {
    const wrapper = mount(DisclaimerBar, {
      props: { text: '以上内容由AI生成，仅供参考' },
    })
    expect(wrapper.find('.disclaimer-text').text()).toBe('以上内容由AI生成，仅供参考')
  })

  it('默认 fixed=false 不添加 .fixed 类', () => {
    const wrapper = mount(DisclaimerBar)
    expect(wrapper.find('.disclaimer-bar').classes()).not.toContain('fixed')
  })

  it('fixed=true 添加 .fixed 类', () => {
    const wrapper = mount(DisclaimerBar, {
      props: { fixed: true },
    })
    expect(wrapper.find('.disclaimer-bar').classes()).toContain('fixed')
  })

  it('自带 role="note" 无障碍属性', () => {
    const wrapper = mount(DisclaimerBar)
    expect(wrapper.find('.disclaimer-bar').attributes('role')).toBe('note')
  })

  it('包含 AppIcon 图标组件', () => {
    const wrapper = mount(DisclaimerBar)
    expect(wrapper.find('.disclaimer-icon').exists()).toBe(true)
  })
})
