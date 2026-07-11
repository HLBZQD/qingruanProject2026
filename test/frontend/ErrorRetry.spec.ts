import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ErrorRetry from '@/components/ErrorRetry.vue'

describe('ErrorRetry.vue', () => {
  it('使用默认 props 渲染', () => {
    const wrapper = mount(ErrorRetry)
    expect(wrapper.find('.error-message').text()).toBe('加载失败，请检查网络后重试')
    expect(wrapper.find('.retry-btn').text()).toContain('点击重试')
  })

  it('自定义 message', () => {
    const wrapper = mount(ErrorRetry, {
      props: { message: '服务器连接失败' },
    })
    expect(wrapper.find('.error-message').text()).toBe('服务器连接失败')
  })

  it('自定义 retryText', () => {
    const wrapper = mount(ErrorRetry, {
      props: { retryText: '重试' },
    })
    expect(wrapper.find('.retry-btn').text()).toContain('重试')
  })

  it('点击重试按钮触发 retry 事件', async () => {
    const wrapper = mount(ErrorRetry)
    await wrapper.find('.retry-btn').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('多次点击触发多次 retry 事件', async () => {
    const wrapper = mount(ErrorRetry)
    await wrapper.find('.retry-btn').trigger('click')
    await wrapper.find('.retry-btn').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(2)
  })

  it('自带 role="alert" + aria-live="polite" 无障碍属性', () => {
    const wrapper = mount(ErrorRetry)
    const root = wrapper.find('.error-retry')
    expect(root.attributes('role')).toBe('alert')
    expect(root.attributes('aria-live')).toBe('polite')
  })
})
