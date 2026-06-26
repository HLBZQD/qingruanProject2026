import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { router } from '@/router'

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
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const authStore = useAuthStore()
      authStore.clearAuth()
      // 非阻断 Toast 提示
      import('sweetalert2').then((Swal) => {
        Swal.default.fire({
          toast: true,
          position: 'top',
          icon: 'info',
          title: '登录已过期，请重新登录',
          showConfirmButton: false,
          timer: 2500,
          timerProgressBar: true,
        })
      })
      router.push('/login')
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
