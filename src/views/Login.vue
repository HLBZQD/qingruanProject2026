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
  <div class="login-page">
    <div class="login-container">

      <!-- ===== 登录视图 ===== -->
      <div v-show="view === 'login'">
        <div class="login-header">
          <h1 class="login-title">糖尿病预治智能助手</h1>
          <p class="login-subtitle">登录您的账号</p>
        </div>

        <form class="login-form" @submit.prevent="handleLogin">
          <input
            v-model="username"
            type="text"
            placeholder="用户名"
            autocomplete="username"
            class="form-input"
          />
          <input
            v-model="password"
            type="password"
            placeholder="密码"
            autocomplete="current-password"
            class="form-input"
          />
          <div v-if="errorMsg" class="form-error">{{ errorMsg }}</div>
          <button
            type="submit"
            :disabled="loading"
            class="form-btn"
          >
            {{ loading ? '登录中...' : '登录' }}
          </button>
        </form>

        <p class="switch-text">
          还没有账号？<a class="switch-link" @click.prevent="switchView('register')">立即注册</a>
        </p>
      </div>

      <!-- ===== 注册视图 ===== -->
      <div v-show="view === 'register'">
        <div class="login-header">
          <h1 class="login-title">糖尿病预治智能助手</h1>
          <p class="login-subtitle">创建您的账号</p>
        </div>

        <form class="login-form" @submit.prevent="handleRegister">
          <input
            v-model="regUsername"
            type="text"
            placeholder="用户名（3-50个字符）"
            autocomplete="username"
            class="form-input"
          />
          <input
            v-model="regPassword"
            type="password"
            placeholder="密码（不少于8位，含字母和数字）"
            autocomplete="new-password"
            class="form-input"
          />
          <input
            v-model="regPasswordConfirm"
            type="password"
            placeholder="确认密码"
            autocomplete="new-password"
            class="form-input"
          />
          <div v-if="regErrorMsg" class="form-error">{{ regErrorMsg }}</div>
          <button
            type="submit"
            :disabled="regLoading"
            class="form-btn"
          >
            {{ regLoading ? '注册中...' : '注册' }}
          </button>
        </form>

        <p class="switch-text">
          已有账号？<a class="switch-link" @click.prevent="switchView('login')">立即登录</a>
        </p>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* ===== 页面容器 ===== */
.login-page {
  min-height: 100vh;
  background: #F5F5F5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
}

.login-container {
  width: 100%;
  max-width: 360px;
}

/* ===== 头部 ===== */
.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-primary, #4A90D9);
  line-height: 1.3;
}

.login-subtitle {
  font-size: 14px;
  color: #9ca3af;
  margin-top: 8px;
}

/* ===== 表单 ===== */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-input {
  width: 100%;
  background: #e5e7eb;
  border-radius: 9999px;
  padding: 12px 16px;
  outline: none;
  font-size: 14px;
  border: 2px solid transparent;
  color: var(--color-text-primary);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.2);
}

.form-input::placeholder {
  color: #9ca3af;
}

.form-error {
  color: #FF4D4F;
  font-size: 12px;
  text-align: center;
}

.form-btn {
  width: 100%;
  background: var(--color-primary, #4A90D9);
  color: #fff;
  padding: 12px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;
}

.form-btn:hover:not(:disabled) {
  background: var(--color-primary-dark, #3A7BC8);
}

.form-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.form-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== 切换提示 ===== */
.switch-text {
  text-align: center;
  font-size: 14px;
  color: #9ca3af;
  margin-top: 24px;
}

.switch-link {
  color: var(--color-primary, #4A90D9);
  cursor: pointer;
  font-weight: 500;
}

.switch-link:hover {
  text-decoration: underline;
}
</style>
