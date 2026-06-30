import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/composables/useApi'
import type { User } from '@/types/models'
import { useHomeStore } from '@/stores/homeStore'
import { useLifePlanStore } from '@/stores/lifePlanStore'
import { useChatStore } from '@/stores/chatStore'
import { useRiskFormStore } from '@/stores/riskFormStore'

function parseRole(raw: string | null): 'user' | 'admin' | null {
  if (raw === 'user' || raw === 'admin') return raw
  return null
}

export const useAuthStore = defineStore('auth', () => {
  // ===== BroadcastChannel 跨标签页认证同步 =====
  // sessionStorage 隔离导致新标签页/外部链接/右键打开均无 token。
  // BroadcastChannel 在 setAuth/clearAuth 时广播，其他标签页收到后同步认证状态。
  let bcChannel: BroadcastChannel | null = null
  function getBcChannel(): BroadcastChannel | null {
    if (bcChannel) return bcChannel
    try {
      bcChannel = new BroadcastChannel('qrzl_auth_sync')
      bcChannel.onmessage = (e: MessageEvent) => {
        const d = e.data
        if (d?.type === 'AUTH_CHANGED') {
          // 去重守卫：避免同标签页内 setAuth/clearAuth → postMessage → onmessage → setAuth/clearAuth 无限回环
          if (d.token === token.value && d.role === role.value) {
            return
          }
          if (d.token) {
            setAuth(d.token, d.role, d.user)
          } else {
            clearAuth()
          }
        } else if (d?.type === 'REQUEST_AUTH') {
          // 新标签页请求认证数据：当前标签页已登录时回复 AUTH_CHANGED
          if (token.value) {
            bcChannel!.postMessage({
              type: 'AUTH_CHANGED',
              token: token.value,
              role: role.value,
              user: user.value,
              timestamp: Date.now(),
            })
          }
          // 未登录时不回复，请求方 500ms 超时后保持未登录状态
        }
      }
      return bcChannel
    } catch {
      // 浏览器不支持 BroadcastChannel（如 IE），静默降级
      return null
    }
  }

  const token = ref<string | null>(sessionStorage.getItem('token'))
  const role = ref<'user' | 'admin' | null>(parseRole(sessionStorage.getItem('role')))
  const user = ref<User | null>(
    (() => {
      try {
        const raw = JSON.parse(sessionStorage.getItem('user') || 'null')
        if (raw && typeof raw === 'object' && typeof raw.id === 'number' && typeof raw.username === 'string' && (raw.role === 'user' || raw.role === 'admin')) {
          return raw as User
        }
      } catch { /* corrupted */ }
      return null
    })()
  )
  const mustChangePassword = ref(localStorage.getItem('must_change_password') === 'true')

  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => role.value === 'admin')

  function setToken(newToken: string) {
    token.value = newToken
    sessionStorage.setItem('token', newToken)
    getBcChannel()?.postMessage({
      type: 'AUTH_CHANGED',
      token: token.value,
      role: role.value,
      user: user.value,
      timestamp: Date.now(),
    })
  }

  function setAuth(newToken: string, newRole: 'user' | 'admin', newUser: User) {
    token.value = newToken
    role.value = newRole
    user.value = newUser
    sessionStorage.setItem('token', newToken)
    sessionStorage.setItem('role', newRole)
    sessionStorage.setItem('user', JSON.stringify(newUser))
    getBcChannel()?.postMessage({
      type: 'AUTH_CHANGED',
      token: newToken,
      role: newRole,
      user: newUser,
      timestamp: Date.now(),
    })
  }

  function syncFromStorage() {
    const storedToken = sessionStorage.getItem('token')
    const storedRole = parseRole(sessionStorage.getItem('role'))
    let storedUser: User | null = null
    try {
      const raw = JSON.parse(sessionStorage.getItem('user') || 'null')
      if (raw && typeof raw === 'object' && typeof raw.id === 'number' && typeof raw.username === 'string' && (raw.role === 'user' || raw.role === 'admin')) {
        storedUser = raw as User
      }
    } catch { /* corrupted */ }

    if (!storedToken || !storedRole) {
      // 不调用 clearAuth()！否则新标签页打开时 BC 广播 null-token AUTH_CHANGED，
      // 导致其他已登录标签页收到广播后也执行 clearAuth()——即新标签页登出所有标签页。
      // 替代方案：通过 BC 请求其他标签页的认证数据（REQUEST_AUTH 协议）
      const bc = getBcChannel()
      if (bc) {
        // 保存原有 onmessage 处理器，安装临时监听器等待 AUTH_CHANGED 回复
        const originalOnmessage = bc.onmessage
        const timeout = setTimeout(() => {
          // 500ms 超时无回复：恢复原有 onmessage，保持未登录状态
          bc.onmessage = originalOnmessage
        }, 500)
        bc.onmessage = (e: MessageEvent) => {
          const d = e.data
          if (d?.type === 'AUTH_CHANGED' && d.token) {
            // 其他标签页回复了认证数据 → 同步登录
            clearTimeout(timeout)
            bc.onmessage = originalOnmessage
            setAuth(d.token, d.role, d.user)
          } else if (d?.type === 'AUTH_CHANGED' && !d.token) {
            // 其他标签页也未登录 → 保持未登录
            clearTimeout(timeout)
            bc.onmessage = originalOnmessage
          } else {
            // 非 AUTH_CHANGED 消息（如 REQUEST_AUTH），交给原有处理器
            if (typeof originalOnmessage === 'function') {
              originalOnmessage.call(bc, e)
            }
          }
        }
        bc.postMessage({ type: 'REQUEST_AUTH' })
      }
      return
    }
    token.value = storedToken
    role.value = storedRole
    user.value = storedUser
    mustChangePassword.value = localStorage.getItem('must_change_password') === 'true'
    // 初始化 BC 监听，使本标签页可以接收其他标签页的认证变更广播
    getBcChannel()
  }

  function clearAuth() {
    token.value = null
    role.value = null
    user.value = null
    mustChangePassword.value = false
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('role')
    sessionStorage.removeItem('user')
    localStorage.removeItem('must_change_password')

    // [S8] 联动清理：清除 sessionStorage 中的业务缓存（旧用户数据隔离）
    // 注意：在 action 内部通过 useXxxStore() 获取实例，避免模块顶层 import 导致 Pinia 循环依赖
    try { useHomeStore().clearHomeCache() } catch { /* Store 未初始化时静默 */ }
    try { useLifePlanStore().clearPlanCache() } catch { /* Store 未初始化时静默 */ }
    try { useChatStore().clearAllConversations() } catch { /* Store 未初始化时静默 */ }
    try { useRiskFormStore().reset() } catch { /* Store 未初始化时静默 */ }

    // [S8] BC 广播：通知其他标签页清除认证状态
    getBcChannel()?.postMessage({
      type: 'AUTH_CHANGED',
      token: null,
      role: null,
      user: null,
      timestamp: Date.now(),
    })
  }

  async function login(username: string, password: string) {
    clearMustChangePassword()
    const res = await api.post('/auth/login', { username, password })
    const data = res.data.data
    setAuth(data.token, data.role, data.user)
    if (data.must_change_password) {
      mustChangePassword.value = true
      localStorage.setItem('must_change_password', 'true')
    }
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } catch { /* ignore */ }
    clearAuth()
  }

  async function fetchProfile() {
    const res = await api.get('/user/profile')
    const profile = res.data.data
    const updatedUser: User = { id: profile.id, username: profile.username, role: profile.role, avatar: profile.avatar }
    user.value = updatedUser
    role.value = profile.role
    sessionStorage.setItem('user', JSON.stringify(updatedUser))
    sessionStorage.setItem('role', profile.role)
  }

  function setProfile(profile: { username?: string; avatar?: string | null }) {
    if (!user.value) return
    if (profile.username) user.value.username = profile.username
    if (profile.avatar !== undefined) user.value.avatar = profile.avatar
    sessionStorage.setItem('user', JSON.stringify(user.value))
  }

  function clearMustChangePassword() {
    mustChangePassword.value = false
    localStorage.removeItem('must_change_password')
  }

  return {
    token, role, user, mustChangePassword,
    isLoggedIn, isAdmin,
    login, logout, setToken, setAuth, syncFromStorage, clearAuth,
    fetchProfile, setProfile, clearMustChangePassword,
  }
})
