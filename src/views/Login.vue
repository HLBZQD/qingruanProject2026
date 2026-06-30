<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/composables/useApi'

import { getErrorMessage } from '@/utils/errorMessage'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const errorMsg = ref('')
const loading = ref(false)

const view = ref<'login' | 'register'>('login')
const regUsername = ref('')
const regPassword = ref('')
const regPasswordConfirm = ref('')
const regErrorMsg = ref('')
const regLoading = ref(false)

function safeRedirect(raw: unknown): string {
  if (typeof raw !== 'string') return '/home'
  // 仅允许相对路径，拒绝绝对 URL 和协议地址
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('://')) {
    return raw
  }
  return '/home'
}

async function handleLogin() {
  if (!username.value || !password.value) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    await authStore.login(username.value, password.value)
    router.replace(safeRedirect(route.query.redirect))
  } catch (err: unknown) {
    errorMsg.value = getErrorMessage(err, '登录失败')
  } finally {
    loading.value = false
  }
}

function switchView(mode: 'login' | 'register'): void {
  view.value = mode
  if (mode === 'login') {
    errorMsg.value = ''
  } else {
    regErrorMsg.value = ''
  }
}

function validateRegister(): string | null {
  if (!regUsername.value) return '请输入用户名'
  if (regUsername.value.length < 3 || regUsername.value.length > 50) return '用户名需3-50个字符'
  if (!regPassword.value) return '请输入密码'
  if (regPassword.value.length < 8) return '密码不少于8位'
  if (!/[a-zA-Z]/.test(regPassword.value)) return '密码需包含字母'
  if (!/[0-9]/.test(regPassword.value)) return '密码需包含数字'
  if (!regPasswordConfirm.value) return '请确认密码'
  if (regPasswordConfirm.value !== regPassword.value) return '两次密码不一致'
  return null
}

async function handleRegister(): Promise<void> {
  const errMsg = validateRegister()
  if (errMsg) {
    regErrorMsg.value = errMsg
    return
  }
  regLoading.value = true
  regErrorMsg.value = ''
  try {
    const res = await api.post('/auth/register', { username: regUsername.value, password: regPassword.value })
    const { token, role, user } = res.data.data
    authStore.setAuth(token, role, user)
    router.replace(safeRedirect(route.query.redirect))
  } catch (err: any) {
    regErrorMsg.value = err?.response?.data?.error?.message || '注册失败'
  } finally {
    regLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center px-6">
    <div class="w-full max-w-sm">

      <!-- ===== 登录视图 ===== -->
      <div v-show="view === 'login'">
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold text-[#4A90D9]">糖尿病预治智能助手</h1>
          <p class="text-sm text-gray-400 mt-2">登录您的账号</p>
        </div>

        <form class="space-y-4" @submit.prevent="handleLogin">
          <input
            v-model="username"
            type="text"
            placeholder="用户名"
            autocomplete="username"
            class="w-full bg-gray-100 rounded-full px-4 py-3 outline-none text-sm focus:ring-2 focus:ring-[#4A90D9]"
          />
          <input
            v-model="password"
            type="password"
            placeholder="密码"
            autocomplete="current-password"
            class="w-full bg-gray-100 rounded-full px-4 py-3 outline-none text-sm focus:ring-2 focus:ring-[#4A90D9]"
          />
          <div v-if="errorMsg" class="text-[#FF4D4F] text-xs text-center">{{ errorMsg }}</div>
          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-[#4A90D9] text-white py-3 rounded-xl font-medium hover:bg-[#3A7BC8] transition disabled:opacity-50"
          >
            {{ loading ? '登录中...' : '登录' }}
          </button>
        </form>

        <p class="text-center text-sm text-gray-400 mt-6">
          还没有账号？<a class="text-[#4A90D9] cursor-pointer hover:underline" @click.prevent="switchView('register')">立即注册</a>
        </p>
      </div>

      <!-- ===== 注册视图 ===== -->
      <div v-show="view === 'register'">
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold text-[#4A90D9]">糖尿病预治智能助手</h1>
          <p class="text-sm text-gray-400 mt-2">创建您的账号</p>
        </div>

        <form class="space-y-4" @submit.prevent="handleRegister">
          <input
            v-model="regUsername"
            type="text"
            placeholder="用户名（3-50个字符）"
            autocomplete="username"
            class="w-full bg-gray-100 rounded-full px-4 py-3 outline-none text-sm focus:ring-2 focus:ring-[#4A90D9]"
          />
          <input
            v-model="regPassword"
            type="password"
            placeholder="密码（不少于8位，含字母和数字）"
            autocomplete="new-password"
            class="w-full bg-gray-100 rounded-full px-4 py-3 outline-none text-sm focus:ring-2 focus:ring-[#4A90D9]"
          />
          <input
            v-model="regPasswordConfirm"
            type="password"
            placeholder="确认密码"
            autocomplete="new-password"
            class="w-full bg-gray-100 rounded-full px-4 py-3 outline-none text-sm focus:ring-2 focus:ring-[#4A90D9]"
          />
          <div v-if="regErrorMsg" class="text-[#FF4D4F] text-xs text-center">{{ regErrorMsg }}</div>
          <button
            type="submit"
            :disabled="regLoading"
            class="w-full bg-[#4A90D9] text-white py-3 rounded-xl font-medium hover:bg-[#3A7BC8] transition disabled:opacity-50"
          >
            {{ regLoading ? '注册中...' : '注册' }}
          </button>
        </form>

        <p class="text-center text-sm text-gray-400 mt-6">
          已有账号？<a class="text-[#4A90D9] cursor-pointer hover:underline" @click.prevent="switchView('login')">立即登录</a>
        </p>
      </div>

    </div>
  </div>
</template>
