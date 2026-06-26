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
    JSON.parse(localStorage.getItem('user') || 'null')
  )
  const mustChangePassword = ref(false)

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
    const storedUser = JSON.parse(localStorage.getItem('user') || 'null')

    if (!storedToken || !storedRole) {
      clearAuth()
      return
    }
    token.value = storedToken
    role.value = storedRole
    user.value = storedUser
  }

  function clearAuth() {
    token.value = null
    role.value = null
    user.value = null
    mustChangePassword.value = false
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('user')
  }

  async function login(username: string, password: string) {
    const res = await api.post('/auth/login', { username, password })
    const data = res.data.data
    setAuth(data.token, data.role, data.user)
    if (data.must_change_password) {
      mustChangePassword.value = true
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
    user.value = { id: profile.id, username: profile.username, role: profile.role, avatar: profile.avatar }
    role.value = profile.role
  }

  function setProfile(profile: { username?: string; avatar?: string | null }) {
    if (!user.value) return
    if (profile.username) user.value.username = profile.username
    if (profile.avatar !== undefined) user.value.avatar = profile.avatar
    localStorage.setItem('user', JSON.stringify(user.value))
  }

  function clearMustChangePassword() {
    mustChangePassword.value = false
  }

  return {
    token, role, user, mustChangePassword,
    isLoggedIn, isAdmin,
    login, logout, setToken, setAuth, syncFromStorage, clearAuth,
    fetchProfile, setProfile, clearMustChangePassword,
  }
})
