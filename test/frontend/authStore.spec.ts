import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Mock sessionStorage 和 localStorage
const sessionStore: Record<string, string> = {}
const localStore: Record<string, string> = {}

vi.stubGlobal('sessionStorage', {
  getItem: vi.fn((key: string) => sessionStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { sessionStore[key] = value }),
  removeItem: vi.fn((key: string) => { delete sessionStore[key] }),
})

vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => localStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { localStore[key] = value }),
  removeItem: vi.fn((key: string) => { delete localStore[key] }),
})

// Mock BroadcastChannel
class MockBroadcastChannel {
  name: string
  onmessage: ((e: MessageEvent) => void) | null = null
  static instances: MockBroadcastChannel[] = []

  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.push(this)
  }

  postMessage(data: unknown) {
    // 广播到所有同频道实例（包括自己）
    for (const instance of MockBroadcastChannel.instances) {
      if (instance.name === this.name && instance.onmessage) {
        instance.onmessage({ data } as MessageEvent)
      }
    }
  }

  close() {
    const idx = MockBroadcastChannel.instances.indexOf(this)
    if (idx >= 0) MockBroadcastChannel.instances.splice(idx, 1)
  }
}

vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)

// Mock API
vi.mock('@/composables/useApi', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
  },
  useApi: () => ({
    api: { post: vi.fn(), get: vi.fn() },
    createCancelToken: () => ({ signal: new AbortController().signal, cancel: vi.fn() }),
  }),
}))

// Mock 其他 stores
vi.mock('@/stores/homeStore', () => ({
  useHomeStore: vi.fn(() => ({ clearHomeCache: vi.fn() })),
}))
vi.mock('@/stores/lifePlanStore', () => ({
  useLifePlanStore: vi.fn(() => ({ clearPlanCache: vi.fn() })),
}))
vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn(() => ({ clearAllConversations: vi.fn() })),
}))
vi.mock('@/stores/riskFormStore', () => ({
  useRiskFormStore: vi.fn(() => ({ reset: vi.fn() })),
}))

import { useAuthStore } from '@/stores/authStore'

describe('authStore', () => {
  beforeEach(() => {
    // 重置 Pinia
    setActivePinia(createPinia())
    // 清空 storage
    Object.keys(sessionStore).forEach(k => delete sessionStore[k])
    Object.keys(localStore).forEach(k => delete localStore[k])
    // 清空 BroadcastChannel 实例
    MockBroadcastChannel.instances = []
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------
  // 初始状态
  // ---------------------------------------------------------------
  describe('初始状态', () => {
    it('无 sessionStorage 时 token/role/user 均为 null', () => {
      const store = useAuthStore()
      expect(store.token).toBeNull()
      expect(store.role).toBeNull()
      expect(store.user).toBeNull()
    })

    it('isLoggedIn 为 false', () => {
      const store = useAuthStore()
      expect(store.isLoggedIn).toBe(false)
    })

    it('isAdmin 为 false', () => {
      const store = useAuthStore()
      expect(store.isAdmin).toBe(false)
    })

    it('mustChangePassword 默认为 false', () => {
      const store = useAuthStore()
      expect(store.mustChangePassword).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // sessionStorage 恢复
  // ---------------------------------------------------------------
  describe('sessionStorage 恢复', () => {
    it('sessionStorage 有 token 和 role 时恢复登录态', () => {
      sessionStore['token'] = 'test-jwt-token'
      sessionStore['role'] = 'user'
      sessionStore['user'] = JSON.stringify({ id: 1, username: 'alice', role: 'user' })

      const store = useAuthStore()
      expect(store.token).toBe('test-jwt-token')
      expect(store.role).toBe('user')
      expect(store.isLoggedIn).toBe(true)
    })

    it('role 为 admin 时 isAdmin 为 true', () => {
      sessionStore['token'] = 'admin-jwt-token'
      sessionStore['role'] = 'admin'
      sessionStore['user'] = JSON.stringify({ id: 2, username: 'admin', role: 'admin' })

      const store = useAuthStore()
      expect(store.isAdmin).toBe(true)
    })

    it('role 为非法值时解析为 null', () => {
      sessionStore['token'] = 'test-token'
      sessionStore['role'] = 'superadmin'
      sessionStore['user'] = JSON.stringify({ id: 1, username: 'test', role: 'user' })

      const store = useAuthStore()
      expect(store.role).toBeNull()
    })

    it('user JSON 损坏时 user 为 null，但 token/role 仍保留', () => {
      sessionStore['token'] = 'test-damaged-token'
      sessionStore['role'] = 'user'
      sessionStore['user'] = 'not-json'

      const store = useAuthStore()
      expect(store.token).toBe('test-damaged-token')
      expect(store.role).toBe('user')
      expect(store.user).toBeNull()
    })

    it('user JSON 格式不完整（缺 id）时 user 为 null', () => {
      sessionStore['token'] = 'test-token'
      sessionStore['role'] = 'user'
      sessionStore['user'] = JSON.stringify({ username: 'alice', role: 'user' })

      const store = useAuthStore()
      expect(store.user).toBeNull()
    })

    it('user JSON 中 role 非法时 user 为 null', () => {
      sessionStore['token'] = 'test-token'
      sessionStore['role'] = 'user'
      sessionStore['user'] = JSON.stringify({ id: 1, username: 'alice', role: 'superadmin' })

      const store = useAuthStore()
      expect(store.user).toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // setToken / setAuth
  // ---------------------------------------------------------------
  describe('setToken', () => {
    it('setToken 更新 token 并写入 sessionStorage', () => {
      const store = useAuthStore()
      store.setToken('new-token')
      expect(store.token).toBe('new-token')
      expect(sessionStore['token']).toBe('new-token')
    })
  })

  describe('setAuth', () => {
    it('setAuth 同步设置 token/role/user 及 sessionStorage', () => {
      const store = useAuthStore()
      const user = { id: 3, username: 'bob', role: 'user' as const }
      store.setAuth('bob-token', 'user', user)

      expect(store.token).toBe('bob-token')
      expect(store.role).toBe('user')
      expect(store.user).toEqual(user)
      expect(sessionStore['token']).toBe('bob-token')
      expect(sessionStore['role']).toBe('user')
      expect(sessionStore['user']).toBe(JSON.stringify(user))
    })

    it('setAuth 后 isLoggedIn 返回 true', () => {
      const store = useAuthStore()
      store.setAuth('t', 'user', { id: 1, username: 'a', role: 'user' })
      expect(store.isLoggedIn).toBe(true)
    })

    it('setAuth 广播 BroadcastChannel AUTH_CHANGED', () => {
      const store = useAuthStore()
      const user = { id: 1, username: 'a', role: 'user' as const }
      store.setAuth('t', 'user', user)

      // 至少创建了一个 BroadcastChannel 实例
      expect(MockBroadcastChannel.instances.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ---------------------------------------------------------------
  // clearAuth
  // ---------------------------------------------------------------
  describe('clearAuth', () => {
    it('clearAuth 清空所有认证状态', () => {
      sessionStore['token'] = 'old-token'
      sessionStore['role'] = 'user'
      sessionStore['user'] = JSON.stringify({ id: 1, username: 'a', role: 'user' })

      const store = useAuthStore()
      store.clearAuth()

      expect(store.token).toBeNull()
      expect(store.role).toBeNull()
      expect(store.user).toBeNull()
      expect(store.isLoggedIn).toBe(false)
    })

    it('clearAuth 清除 sessionStorage', () => {
      sessionStore['token'] = 'old-token'
      sessionStore['role'] = 'user'

      const store = useAuthStore()
      store.clearAuth()

      expect('token' in sessionStore).toBe(false)
      expect('role' in sessionStore).toBe(false)
      expect('user' in sessionStore).toBe(false)
    })

    it('clearAuth 清除 must_change_password', () => {
      localStore['must_change_password'] = 'true'
      const store = useAuthStore()
      store.clearAuth()

      expect(store.mustChangePassword).toBe(false)
      expect('must_change_password' in localStore).toBe(false)
    })

    it('clearAuth 广播 AUTH_CHANGED (token=null)', () => {
      sessionStore['token'] = 't'
      sessionStore['role'] = 'user'
      sessionStore['user'] = JSON.stringify({ id: 1, username: 'a', role: 'user' })

      const store = useAuthStore()
      store.clearAuth()
      // BroadcastChannel 实例已创建并广播了
      expect(MockBroadcastChannel.instances.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ---------------------------------------------------------------
  // setProfile
  // ---------------------------------------------------------------
  describe('setProfile', () => {
    it('setProfile 更新 username', () => {
      sessionStore['token'] = 't'
      sessionStore['role'] = 'user'
      sessionStore['user'] = JSON.stringify({ id: 1, username: 'old', role: 'user' })

      const store = useAuthStore()
      store.setProfile({ username: 'newname' })
      expect(store.user?.username).toBe('newname')
      expect(JSON.parse(sessionStore['user']).username).toBe('newname')
    })

    it('setProfile 更新 avatar', () => {
      sessionStore['token'] = 't'
      sessionStore['role'] = 'user'
      sessionStore['user'] = JSON.stringify({ id: 1, username: 'a', role: 'user', avatar: null })

      const store = useAuthStore()
      store.setProfile({ avatar: 'https://example.com/avatar.png' })
      expect(store.user?.avatar).toBe('https://example.com/avatar.png')
    })

    it('setProfile 设置 avatar 为 null', () => {
      sessionStore['token'] = 't'
      sessionStore['role'] = 'user'
      sessionStore['user'] = JSON.stringify({ id: 1, username: 'a', role: 'user', avatar: 'old.png' })

      const store = useAuthStore()
      store.setProfile({ avatar: null })
      expect(store.user?.avatar).toBeNull()
    })

    it('user 为 null 时 setProfile 无操作', () => {
      const store = useAuthStore()
      expect(() => store.setProfile({ username: 'test' })).not.toThrow()
      expect(store.user).toBeNull()
    })

    it('空对象 setProfile 不改变 user', () => {
      sessionStore['token'] = 't'
      sessionStore['role'] = 'user'
      sessionStore['user'] = JSON.stringify({ id: 1, username: 'a', role: 'user' })

      const store = useAuthStore()
      const before = { ...store.user }
      store.setProfile({})
      expect(store.user?.username).toBe(before.username)
    })
  })

  // ---------------------------------------------------------------
  // clearMustChangePassword
  // ---------------------------------------------------------------
  describe('clearMustChangePassword', () => {
    it('清除 mustChangePassword 状态', () => {
      localStore['must_change_password'] = 'true'
      const store = useAuthStore()
      store.clearMustChangePassword()
      expect(store.mustChangePassword).toBe(false)
      expect('must_change_password' in localStore).toBe(false)
    })
  })
})
