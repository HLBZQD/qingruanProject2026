import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FabButton from '@/components/FabButton.vue'

describe('FabButton.vue', () => {
  it('渲染 FAB 按钮', () => {
    const wrapper = mount(FabButton)
    expect(wrapper.find('.fab-button').exists()).toBe(true)
  })

  it('aria-label 为 AI 智能助手', () => {
    const wrapper = mount(FabButton)
    expect(wrapper.find('.fab-button').attributes('aria-label')).toBe('AI 智能助手')
  })

  it('默认不添加 .open 类', () => {
    const wrapper = mount(FabButton)
    expect(wrapper.find('.fab-button').classes()).not.toContain('open')
  })

  it('open=true 时添加 .open 类', () => {
    const wrapper = mount(FabButton, {
      props: { open: true },
    })
    expect(wrapper.find('.fab-button').classes()).toContain('open')
  })

  it('点击按钮触发 click 事件', async () => {
    const wrapper = mount(FabButton)
    await wrapper.find('.fab-button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('多次点击触发多次事件', async () => {
    const wrapper = mount(FabButton)
    await wrapper.find('.fab-button').trigger('click')
    await wrapper.find('.fab-button').trigger('click')
    await wrapper.find('.fab-button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(3)
  })

  it('包含 fa-robot 图标', () => {
    const wrapper = mount(FabButton)
    expect(wrapper.find('.fa-robot').exists()).toBe(true)
  })
})
