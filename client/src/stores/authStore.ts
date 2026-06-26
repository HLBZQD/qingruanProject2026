import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/composables/useApi'
import type { LoginUser } from '@/types/api'

function parseRole(raw: string | null): 'user' | 'admin' | null {
  if (raw === 'user' || raw === 'admin') return raw
  return null
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const role = ref<'user' | 'admin' | null>(parseRole(localStorage.getItem('role')))
  const user = ref<LoginUser | null>(
    (() => {
      try {
        const raw = JSON.parse(localStorage.getItem('user') || 'null')
        if (raw && typeof raw === 'object' && typeof raw.id === 'number' && typeof raw.username === 'string' && (raw.role === 'user' || raw.role === 'admin')) {
          return raw as LoginUser
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
    localStorage.setItem('token', newToken)
  }

  function setAuth(newToken: string, newRole: 'user' | 'admin', newUser: LoginUser) {
    token.value = newToken
    role.value = newRole
    user.value = newUser
    localStorage.setItem('token', newToken)
    localStorage.setItem('role', newRole)
    localStorage.setItem('user', JSON.stringify(newUser))
  }

  function syncFromStorage() {
    const storedToken = localStorage.getItem('token')
    const storedRole = parseRole(localStorage.getItem('role'))
    let storedUser: LoginUser | null = null
    try {
      const raw = JSON.parse(localStorage.getItem('user') || 'null')
      if (raw && typeof raw === 'object' && typeof raw.id === 'number' && typeof raw.username === 'string' && (raw.role === 'user' || raw.role === 'admin')) {
        storedUser = raw as LoginUser
      }
    } catch { /* corrupted */ }

    if (!storedToken || !storedRole) {
      clearAuth()
      return
    }
    token.value = storedToken
    role.value = storedRole
    user.value = storedUser
    mustChangePassword.value = localStorage.getItem('must_change_password') === 'true'
  }

  function clearAuth() {
    token.value = null
    role.value = null
    user.value = null
    mustChangePassword.value = false
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('user')
    localStorage.removeItem('must_change_password')
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
    const updatedUser: LoginUser = { id: profile.id, username: profile.username, role: profile.role, avatar: profile.avatar }
    user.value = updatedUser
    role.value = profile.role
    localStorage.setItem('user', JSON.stringify(updatedUser))
    localStorage.setItem('role', profile.role)
  }

  function setProfile(profile: { username?: string; avatar?: string | null }) {
    if (!user.value) return
    if (profile.username) user.value.username = profile.username
    if (profile.avatar !== undefined) user.value.avatar = profile.avatar
    localStorage.setItem('user', JSON.stringify(user.value))
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
