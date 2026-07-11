import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

// 动态 import —— 必须在 beforeAll 中 mock localStorage 之后
let App: any

const storageMap = new Map<string, string>()

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/home', component: { template: '<div>home</div>' } },
      { path: '/login', component: { template: '<div>login</div>' } },
      { path: '/change-password', component: { template: '<div>cp</div>' } },
    ],
  })
}

describe('App.vue S1 — localStorage StorageEvent 死代码清理', () => {
  beforeAll(async () => {
    // 在 Pinia Store 初始化之前 mock Storage API
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
      setItem: vi.fn((key: string, val: string) => { storageMap.set(key, val) }),
      removeItem: vi.fn((key: string) => { storageMap.delete(key) }),
    })
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {}),
      removeItem: vi.fn(() => {}),
    })
    // 动态 import，确保 vi.stubGlobal 先生效
    const mod = await import('@/App.vue')
    App = mod.default
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    storageMap.clear()
  })

  describe('BC-S1-1: 不再监听 window storage 事件', () => {
    it('挂载时不注册 storage 事件监听器', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const router = makeRouter()
      await router.push('/home')
      await router.isReady()

      mount(App, {
        global: { plugins: [router] },
      })

      const storageCalls = addSpy.mock.calls.filter(
        (call) => call[0] === 'storage',
      )
      expect(storageCalls).toHaveLength(0)
    })

    it('卸载时不调用 removeEventListener 移除 storage 监听', async () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const router = makeRouter()
      await router.push('/home')
      await router.isReady()

      const wrapper = mount(App, {
        global: { plugins: [router] },
      })

      wrapper.unmount()

      const storageRemoveCalls = removeSpy.mock.calls.filter(
        (call) => call[0] === 'storage',
      )
      expect(storageRemoveCalls).toHaveLength(0)
    })
  })

  describe('BC-S1-2: 核心逻辑保持不变', () => {
    it('TabBar 在非隐藏路由下渲染', async () => {
      const router = makeRouter()
      await router.push('/home')
      await router.isReady()

      const wrapper = mount(App, {
        global: {
          plugins: [router],
          stubs: { TabBar: true, FabButton: true, AiChatDialog: true },
        },
      })

      expect(wrapper.findComponent({ name: 'TabBar' }).exists()).toBe(true)
    })

    it('Login 页面不渲染 TabBar', async () => {
      const router = makeRouter()
      await router.push('/login')
      await router.isReady()

      const wrapper = mount(App, {
        global: {
          plugins: [router],
          stubs: { TabBar: true, FabButton: true, AiChatDialog: true },
        },
      })

      expect(wrapper.findComponent({ name: 'TabBar' }).exists()).toBe(false)
    })
  })
})
