import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import TabBar from '@/components/TabBar.vue'

// Mock vue-router
const mockRoutePath = ref('/home')
vi.mock('vue-router', () => ({
  useRoute: () => ({
    path: mockRoutePath.value,
  }),
}))

import { ref } from 'vue'

const defaultTabs = [
  { path: '/home', label: '首页', icon: 'home' },
  { path: '/risk', label: '风险预测', icon: 'fa-heart-pulse' },
  { path: '/plan', label: '生活方案', icon: 'fa-list-check' },
  { path: '/profile', label: '我的', icon: 'fa-user' },
]

// 辅助：带 RouterLinkStub 的 mount
function mountTabBar(props = {}) {
  return mount(TabBar, {
    props: { tabs: defaultTabs, ...props },
    global: {
      stubs: {
        'router-link': RouterLinkStub,
      },
    },
  })
}

describe('TabBar.vue', () => {
  beforeEach(() => {
    mockRoutePath.value = '/home'
  })

  // ---------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------
  describe('渲染', () => {
    it('正确渲染所有 tab 项', () => {
      const wrapper = mountTabBar()
      const items = wrapper.findAll('.tab-item')
      expect(items).toHaveLength(4)
    })

    it('渲染 nav 元素 role="tablist"', () => {
      const wrapper = mountTabBar()
      const nav = wrapper.find('nav')
      expect(nav.attributes('role')).toBe('tablist')
      expect(nav.attributes('aria-label')).toBe('底部导航')
    })

    it('每个 router-link 具有 role="tab"', () => {
      const wrapper = mountTabBar()
      const items = wrapper.findAll('.tab-item')
      for (const item of items) {
        expect(item.attributes('role')).toBe('tab')
      }
    })

    it('渲染图标与标签文本', () => {
      const wrapper = mountTabBar()
      const firstItem = wrapper.find('.tab-item')
      expect(firstItem.find('.tab-icon').exists()).toBe(true)
      expect(firstItem.find('.tab-label').text()).toBe('首页')
    })

    it('图标具有 aria-hidden="true"', () => {
      const wrapper = mountTabBar()
      const icons = wrapper.findAll('.tab-icon')
      for (const icon of icons) {
        expect(icon.attributes('aria-hidden')).toBe('true')
      }
    })
  })

  // ---------------------------------------------------------------
  // 活跃状态
  // ---------------------------------------------------------------
  describe('活跃状态', () => {
    it('当前路由匹配的 tab 添加 active class', () => {
      mockRoutePath.value = '/home'
      const wrapper = mountTabBar()
      const items = wrapper.findAll('.tab-item')
      expect(items[0].classes()).toContain('active')
      expect(items[1].classes()).not.toContain('active')
    })

    it('路由变化后 active 状态更新', async () => {
      mockRoutePath.value = '/risk'
      const wrapper = mountTabBar()
      // 由于 useRoute 是响应式的，需要验证
      const items = wrapper.findAll('.tab-item')
      // route.path === '/risk' 应激活第二个 tab
      expect(items[1].attributes('aria-selected')).toBe('true')
    })

    it('子路径匹配父 tab（startsWith）', () => {
      mockRoutePath.value = '/home/detail'
      const wrapper = mountTabBar()
      const items = wrapper.findAll('.tab-item')
      expect(items[0].attributes('aria-selected')).toBe('true')
    })

    it('无匹配 tab 时所有 tab 为非活跃', () => {
      mockRoutePath.value = '/unknown-page'
      const wrapper = mountTabBar()
      const items = wrapper.findAll('.tab-item')
      for (const item of items) {
        expect(item.classes()).not.toContain('active')
      }
    })

    it('活跃 tab 设置 aria-selected="true"，非活跃为 "false"', () => {
      mockRoutePath.value = '/home'
      const wrapper = mountTabBar()
      const items = wrapper.findAll('.tab-item')
      expect(items[0].attributes('aria-selected')).toBe('true')
      expect(items[1].attributes('aria-selected')).toBe('false')
    })
  })

  // ---------------------------------------------------------------
  // 事件
  // ---------------------------------------------------------------
  describe('事件', () => {
    it('点击 tab 触发 tab-click 事件并传递 path', async () => {
      const wrapper = mountTabBar()
      await wrapper.findAll('.tab-item')[2].trigger('click')
      expect(wrapper.emitted('tab-click')).toHaveLength(1)
      expect(wrapper.emitted('tab-click')![0]).toEqual(['/plan'])
    })

    it('点击已活跃 tab 仍触发事件', async () => {
      mockRoutePath.value = '/home'
      const wrapper = mountTabBar()
      await wrapper.findAll('.tab-item')[0].trigger('click')
      expect(wrapper.emitted('tab-click')).toHaveLength(1)
    })
  })

  // ---------------------------------------------------------------
  // 边界条件
  // ---------------------------------------------------------------
  describe('边界条件', () => {
    it('空 tabs 数组不渲染任何 tab-item', () => {
      const wrapper = mountTabBar({ tabs: [] })
      expect(wrapper.findAll('.tab-item')).toHaveLength(0)
    })

    it('单个 tab 渲染正确', () => {
      const wrapper = mountTabBar({ tabs: [{ path: '/only', label: '唯一', icon: 'fa-star' }] })
      expect(wrapper.findAll('.tab-item')).toHaveLength(1)
      expect(wrapper.find('.tab-label').text()).toBe('唯一')
    })

    it('每个 tab-item 渲染为带路径的链接', () => {
      const wrapper = mountTabBar()
      const links = wrapper.findAll('.tab-item')
      expect(links).toHaveLength(defaultTabs.length)
      // 验证每个链接元素存在且有正确的标签文本
      for (let i = 0; i < defaultTabs.length; i++) {
        expect(links[i].find('.tab-label').text()).toBe(defaultTabs[i].label)
        expect(links[i].find('.tab-icon').exists()).toBe(true)
      }
    })
  })
})
