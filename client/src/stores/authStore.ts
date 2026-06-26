import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LoginUser } from '@/types/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const role = ref<'user' | 'admin' | null>(localStorage.getItem('role') as 'user' | 'admin' | null)
  const user = ref<LoginUser | null>(null)
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
  }

  function syncFromStorage() {
    token.value = localStorage.getItem('token')
    role.value = localStorage.getItem('role') as 'user' | 'admin' | null
  }

  function clearAuth() {
    token.value = null
    role.value = null
    user.value = null
    mustChangePassword.value = false
    localStorage.removeItem('token')
    localStorage.removeItem('role')
  }

  async function login(username: string, password: string) {
    const axios = (await import('axios')).default
    const res = await axios.post('/api/auth/login', { username, password })
    const data = res.data.data
    setAuth(data.token, data.role, data.user)
    if (data.must_change_password) {
      mustChangePassword.value = true
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch { /* ignore */ }
    clearAuth()
  }

  async function fetchProfile(): Promise<void> {
    const axios = (await import('axios')).default
    const res = await axios.get('/api/user/profile')
    user.value = res.data.data
    role.value = res.data.data.role
  }

  function clearMustChangePassword() {
    mustChangePassword.value = false
  }

  return {
    token, role, user, mustChangePassword,
    isLoggedIn, isAdmin,
    login, logout, setToken, setAuth, syncFromStorage, clearAuth,
    fetchProfile, clearMustChangePassword,
  }
})
