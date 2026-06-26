<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const errorMsg = ref('')
const loading = ref(false)

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
  } catch (err: any) {
    errorMsg.value = err?.response?.data?.error?.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center px-6">
    <div class="w-full max-w-sm">
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
        还没有账号？<router-link to="/login" class="text-[#4A90D9]">立即注册</router-link>
      </p>
    </div>
  </div>
</template>
