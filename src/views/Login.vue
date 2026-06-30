<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/composables/useApi'
import AppIcon from '@/components/icons/AppIcon.vue'
import DiabetesIcon from '@/components/icons/DiabetesIcon.vue'
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
    <!-- 几何背景装饰 -->
    <div class="geo-deco" aria-hidden="true">
      <span class="deco-arc deco-arc-1"></span>
      <span class="deco-arc deco-arc-2"></span>
      <span class="deco-block deco-block-1"></span>
      <span class="deco-block deco-block-2"></span>
      <span class="deco-dots"></span>
    </div>

    <div class="login-container">
      <!-- 品牌区 -->
      <div class="login-brand">
        <div class="brand-mark">
          <DiabetesIcon name="diabetes" :size="38" color="#fff" />
        </div>
        <h1 class="brand-title">糖尿病预治智能助手</h1>
        <p class="brand-subtitle">精准监测 · 科学控糖 · 智慧生活</p>
        <div class="brand-badges">
          <span class="brand-badge brand-badge-mint">
            <span class="data-dot-static"></span>AI 驱动
          </span>
          <span class="brand-badge brand-badge-coral">
            <span class="data-dot-static"></span>7×24 在线
          </span>
        </div>
      </div>

      <!-- 登录视图 -->
      <div v-show="view === 'login'" class="login-form-panel">
        <div class="form-header">
          <h2 class="form-title">欢迎回来</h2>
          <p class="form-desc">登录以查看您的健康数据</p>
        </div>

        <form class="login-form" @submit.prevent="handleLogin">
          <div class="input-group">
            <label class="input-label">用户名</label>
            <input
              v-model="username"
              type="text"
              placeholder="请输入用户名"
              autocomplete="username"
              class="form-input"
            />
          </div>
          <div class="input-group">
            <label class="input-label">密码</label>
            <input
              v-model="password"
              type="password"
              placeholder="请输入密码"
              autocomplete="current-password"
              class="form-input"
            />
          </div>
          <div v-if="errorMsg" class="form-error">{{ errorMsg }}</div>
          <button
            type="submit"
            :disabled="loading"
            class="form-btn"
          >
            <span v-if="loading" class="btn-loader"></span>
            <span>{{ loading ? '登录中' : '登录' }}</span>
          </button>
        </form>

        <p class="switch-text">
          还没有账号？<a class="switch-link" @click.prevent="switchView('register')">立即注册</a>
        </p>
      </div>

      <!-- 注册视图 -->
      <div v-show="view === 'register'" class="login-form-panel">
        <div class="form-header">
          <h2 class="form-title">创建账号</h2>
          <p class="form-desc">开始您的健康管理之旅</p>
        </div>

        <form class="login-form" @submit.prevent="handleRegister">
          <div class="input-group">
            <label class="input-label">用户名</label>
            <input
              v-model="regUsername"
              type="text"
              placeholder="3-50个字符"
              autocomplete="username"
              class="form-input"
            />
          </div>
          <div class="input-group">
            <label class="input-label">密码</label>
            <input
              v-model="regPassword"
              type="password"
              placeholder="不少于8位，含字母和数字"
              autocomplete="new-password"
              class="form-input"
            />
          </div>
          <div class="input-group">
            <label class="input-label">确认密码</label>
            <input
              v-model="regPasswordConfirm"
              type="password"
              placeholder="请再次输入密码"
              autocomplete="new-password"
              class="form-input"
            />
          </div>
          <div v-if="regErrorMsg" class="form-error">{{ regErrorMsg }}</div>
          <button
            type="submit"
            :disabled="regLoading"
            class="form-btn"
          >
            <span v-if="regLoading" class="btn-loader"></span>
            <span>{{ regLoading ? '注册中' : '注册' }}</span>
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
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  position: relative;
  overflow: hidden;
}

/* ===== 几何背景装饰 ===== */
.geo-deco {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.deco-arc {
  position: absolute;
  border-radius: 50%;
  border: 3px solid transparent;
}

.deco-arc-1 {
  width: 300px;
  height: 300px;
  top: -120px;
  right: -100px;
  border-color: var(--color-primary-soft);
  opacity: 0.4;
}

.deco-arc-2 {
  width: 220px;
  height: 220px;
  bottom: -80px;
  left: -80px;
  border-color: var(--color-accent);
  opacity: 0.25;
}

.deco-block {
  position: absolute;
  border-radius: 24%;
}

.deco-block-1 {
  width: 80px;
  height: 80px;
  top: 15%;
  left: 8%;
  background: var(--color-vivid);
  opacity: 0.08;
  transform: rotate(20deg);
}

.deco-block-2 {
  width: 56px;
  height: 56px;
  bottom: 20%;
  right: 10%;
  background: var(--color-amber);
  opacity: 0.1;
  transform: rotate(-15deg);
}

.deco-dots {
  position: absolute;
  inset: 0;
  opacity: 0.25;
  background-image: radial-gradient(circle, var(--color-divider) 1.5px, transparent 1.5px);
  background-size: 20px 20px;
}

.login-container {
  width: 100%;
  max-width: 380px;
  position: relative;
  z-index: 1;
}

/* ===== 品牌区 ===== */
.login-brand {
  text-align: center;
  margin-bottom: 28px;
}

.brand-mark {
  width: 72px;
  height: 72px;
  margin: 0 auto 16px;
  background: var(--color-primary);
  border-radius: 30%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: var(--shadow-primary);
  transform: rotate(3deg);
}

.brand-title {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: -0.02em;
}

.brand-subtitle {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-top: 6px;
  font-weight: 500;
}

.brand-badges {
  display: inline-flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}

.brand-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-size-xs);
  font-weight: 600;
  padding: 5px 12px;
  border-radius: var(--radius-tag);
}

.brand-badge-mint {
  color: var(--color-accent-dark);
  background: var(--color-accent-light);
}

.brand-badge-coral {
  color: var(--color-vivid-dark);
  background: var(--color-vivid-light);
}

/* ===== 表单面板 ===== */
.login-form-panel {
  background: var(--color-card);
  border: 1.5px solid var(--color-border);
  border-radius: 28px 28px 12px 12px;
  padding: var(--spacing-2xl);
  box-shadow: var(--shadow-lg);
  animation: pageEnterFadeIn 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) both;
  position: relative;
}

.login-form-panel::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 24px;
  right: 24px;
  height: 12px;
  background: var(--color-primary-light);
  border-radius: var(--radius-full);
  z-index: -1;
}

.form-header {
  margin-bottom: var(--spacing-xl);
}

.form-title {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: -0.02em;
}

.form-desc {
  font-size: var(--font-size-caption);
  color: var(--color-text-tertiary);
  margin-top: 4px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.input-label {
  font-size: var(--font-size-caption);
  font-weight: 700;
  color: var(--color-text-secondary);
}

.form-input {
  width: 100%;
  background: var(--color-bg);
  border-radius: var(--radius-md);
  padding: 13px 16px;
  outline: none;
  font-size: var(--font-size-body);
  border: 1.5px solid var(--color-border);
  color: var(--color-text-primary);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.form-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.form-input::placeholder {
  color: var(--color-text-tertiary);
}

.form-error {
  color: var(--color-danger);
  font-size: var(--font-size-caption);
  text-align: center;
  padding: 8px;
  background: var(--color-danger-light);
  border-radius: var(--radius-sm);
  font-weight: 600;
  border-left: 3px solid var(--color-danger);
}

.form-btn {
  width: 100%;
  background: var(--color-primary);
  color: #fff;
  padding: 14px;
  border-radius: var(--radius-button);
  font-size: var(--font-size-body);
  font-weight: 700;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  transition: background var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast);
  margin-top: 4px;
  box-shadow: var(--shadow-primary);
}

.form-btn:hover:not(:disabled) {
  background: var(--color-primary-dark);
}

.form-btn:active:not(:disabled) {
  transform: scale(0.98);
  box-shadow: var(--shadow-md);
}

.form-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-loader {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ===== 切换提示 ===== */
.switch-text {
  text-align: center;
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  margin-top: var(--spacing-xl);
}

.switch-link {
  color: var(--color-primary);
  cursor: pointer;
  font-weight: 700;
}

.switch-link:hover {
  text-decoration: underline;
}
</style>
