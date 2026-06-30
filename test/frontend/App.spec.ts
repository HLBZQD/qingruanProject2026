import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import App from '@/App.vue'

// ============================================================
// App.vue — S1 死代码清理验证
// ============================================================
//
// 行为契约来源: detail_v2.md §修改1
//
// BC-S1-1: App.vue 不再监听 window storage 事件
//   前置: 无
//   后置: App.vue 挂载/卸载时不注册/移除 storage 事件监听器;
//         跨标签页认证同步完全由 authStore.ts 的 BroadcastChannel 机制承担
//
// BC-S1-2: App.vue 模板和核心逻辑不变
//   前置: 无
//   后置: showTabBar/showFab 计算属性、toggleFab 函数保持原有行为;
//         TabBar/FabButton/AiChatDialog 组件正常渲染

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
  beforeEach(() => {
    setActivePinia(createPinia())
    // 模拟 sessionStorage: authStore.syncFromStorage 读取
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

      // 验证：不应有对 'storage' 事件的 addEventListener 调用
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

      // 验证：卸载时不应有 removeEventListener('storage', ...) 调用
      // S1 已删除 onUnmounted 中的 storage 事件清理逻辑
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
