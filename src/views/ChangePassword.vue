<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { changePassword } from '@/composables/useUserApi'
import Swal from 'sweetalert2'

const router = useRouter()
const authStore = useAuthStore()

const newPassword = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const newPwdError = ref('')
const confirmPwdError = ref('')

const isForced = computed(() => authStore.mustChangePassword)

function validatePassword(pw: string): string {
  if (!pw || pw.length < 8) return '密码长度不能少于 8 位'
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return '密码需同时包含字母和数字'
  return ''
}

function validateForm(): boolean {
  newPwdError.value = validatePassword(newPassword.value)
  confirmPwdError.value =
    newPassword.value !== confirmPassword.value ? '两次输入的密码不一致' : ''
  return !newPwdError.value && !confirmPwdError.value
}

async function handleSubmit() {
  if (submitting.value) return
  if (!validateForm()) {
    Swal.fire({ toast: true, position: 'top', icon: 'warning', title: '请检查输入内容', showConfirmButton: false, timer: 2000 })
    return
  }

  submitting.value = true
  try {
    await changePassword({ new_password: newPassword.value })
    authStore.clearMustChangePassword()
    await Swal.fire({
      title: '密码修改成功',
      text: '请使用新密码登录',
      icon: 'success',
      confirmButtonText: '确定',
    })
    router.push(authStore.isAdmin ? '/admin' : '/home')
  } catch (err: unknown) {
    const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      || (err as { message?: string }).message
      || '密码修改失败，请稍后重试'
    Swal.fire({ toast: true, position: 'top', icon: 'error', title: message, showConfirmButton: false, timer: 2500 })
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  if (!isForced.value && authStore.isLoggedIn) {
    // 非强制改密场景，管理员直接跳管理页，普通用户跳首页
    router.push(authStore.isAdmin ? '/admin' : '/home')
  }
})
</script>

<template>
  <div class="change-pwd-container">
    <div class="change-pwd-card">
      <div class="lock-icon">
        <i class="fas fa-lock" aria-hidden="true"></i>
      </div>
      <h1>首次登录，请修改密码</h1>
      <p class="hint-text">
        系统检测到您正在使用默认密码。为保障管理安全，请立即设置新密码。
      </p>

      <form id="change-pwd-form" @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="new-pwd">
            新密码 <span class="required">*</span>
          </label>
          <input
            id="new-pwd"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            placeholder="请输入新密码"
            @blur="newPwdError = validatePassword(newPassword)"
          />
          <span class="hint">不少于 8 位，需同时包含字母和数字</span>
          <span v-if="newPwdError" class="field-error">{{ newPwdError }}</span>
        </div>

        <div class="form-group">
          <label for="confirm-pwd">
            确认新密码 <span class="required">*</span>
          </label>
          <input
            id="confirm-pwd"
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            placeholder="请再次输入新密码"
            @blur="confirmPwdError = newPassword !== confirmPassword ? '两次输入的密码不一致' : ''"
          />
          <span v-if="confirmPwdError" class="field-error">{{ confirmPwdError }}</span>
        </div>

        <button
          type="submit"
          class="btn-submit"
          :disabled="submitting"
        >
          <i v-if="submitting" class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {{ submitting ? '提交中...' : '确认修改' }}
        </button>
      </form>

      <p class="footer-text">修改完成后将跳转至管理界面</p>
    </div>
  </div>
</template>

<style scoped>
.change-pwd-container {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--color-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-lg);
}

.change-pwd-card {
  width: 100%;
  max-width: 360px;
  background: var(--color-card);
  border-radius: 20px;
  padding: var(--spacing-2xl);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  text-align: center;
}

.lock-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-warning), #ffc53d);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin: 0 auto var(--spacing-lg);
}

.change-pwd-card h1 {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}

.hint-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: var(--spacing-xl);
}

.form-group {
  text-align: left;
  margin-bottom: var(--spacing-lg);
}

.form-group label {
  display: block;
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 6px;
}

.required {
  color: var(--color-danger);
}

.form-group input {
  width: 100%;
  padding: 11px 14px;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-md);
  font-size: var(--font-size-body);
  background: var(--color-bg);
  color: var(--color-text-primary);
  outline: none;
  transition: border-color var(--transition-fast);
}

.form-group input:focus {
  border-color: var(--color-primary);
}

.form-group .hint {
  display: block;
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin-top: 4px;
}

.field-error {
  display: block;
  font-size: 12px;
  color: var(--color-danger);
  margin-top: 6px;
}

.btn-submit {
  width: 100%;
  padding: 12px;
  border-radius: var(--radius-button);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-body);
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: transform var(--transition-fast), opacity var(--transition-fast);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-submit:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-submit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.footer-text {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin-top: var(--spacing-lg);
}
</style>
