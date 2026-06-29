import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from '@/components/EmptyState.vue'

describe('EmptyState.vue', () => {
  it('使用默认插槽渲染标题与图标', () => {
    const wrapper = mount(EmptyState)
    expect(wrapper.find('.empty-title').text()).toBe('暂无数据')
    expect(wrapper.find('.empty-icon').classes()).toContain('fa-inbox')
  })

  it('传入 props 时渲染自定义内容', () => {
    const wrapper = mount(EmptyState, {
      props: { icon: 'fa-list', title: '暂无文章', description: '还没有内容' },
    })
    expect(wrapper.find('.empty-title').text()).toBe('暂无文章')
    expect(wrapper.find('.empty-desc').text()).toBe('还没有内容')
    expect(wrapper.find('.empty-icon').classes()).toContain('fa-list')
  })

  it('未传 actionText 时不渲染按钮', () => {
    const wrapper = mount(EmptyState)
    expect(wrapper.find('.empty-action').exists()).toBe(false)
  })

  it('点击按钮触发 action 事件', async () => {
    const wrapper = mount(EmptyState, {
      props: { actionText: '刷新' },
    })
    await wrapper.find('.empty-action').trigger('click')
    expect(wrapper.emitted('action')).toHaveLength(1)
  })
})
