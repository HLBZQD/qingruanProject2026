import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { router } from '@/router'
import { showInfo } from '@/composables/useUI'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const authStore = useAuthStore()
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => {
    // PHASE1: 日志收集期 — 记录 success:false 响应并 reject，
    // 确认无误报后移除 console.warn (G14-phase2)
    if (res.data && typeof res.data.success === 'boolean' && !res.data.success) {
      console.warn(
        '[API] success:false 响应拦截',
        {
          url: res.config?.url,
          method: res.config?.method?.toUpperCase(),
          status: res.status,
          message: res.data.message ?? '(无消息)',
        },
      )
      const err = new Error(res.data.message || '请求失败') as Error & { response?: { data?: { message?: string } } }
      err.response = { data: { message: res.data.message } }
      return Promise.reject(err)
    }
    return res
  },
  (err) => {
    if (err.response?.status === 401) {
      const authStore = useAuthStore()
      authStore.clearAuth()
      // G3: 附带 redirect 参数，登录后可回跳原页面
      const redirect = encodeURIComponent(window.location.pathname + window.location.search)
      showInfo('登录已过期，请重新登录')
      router.push('/login?redirect=' + redirect)
    }
    return Promise.reject(err)
  },
)

export { api }

export function createCancelToken() {
  const controller = new AbortController()
  return { signal: controller.signal, cancel: () => controller.abort() }
}

export function useApi() {
  return { api, createCancelToken }
}
