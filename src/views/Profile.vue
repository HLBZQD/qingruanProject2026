<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useRiskFormStore } from '@/stores/riskFormStore'
import { api } from '@/composables/useApi'
import { formatDate } from '@/utils/helpers'
import Swal from 'sweetalert2'
import type { UserProfile } from '@/types/api'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const riskFormStore = useRiskFormStore()

const profile = ref<UserProfile | null>(null)
const profileLoading = ref(true)
const profileError = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
let loadAbort: AbortController | null = null
let uploadAbort: AbortController | null = null

const isSubRouteActive = computed(() => route.path !== '/profile')
const defaultAvatar = '/static/images/default/default-avatar.png'

function isValidAvatarUrl(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//')
}

const displayName = computed(() => {
  return profile.value?.username || authStore.user?.username || '用户'
})

const roleText = computed(() => {
  return authStore.role === 'admin' ? '管理员' : '普通用户'
})

const memberDays = computed(() => {
  if (!profile.value?.created_at) return 0
  const diff = Date.now() - new Date(profile.value.created_at).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
})

const joinDateText = computed(() => {
  if (!profile.value?.created_at) return ''
  return `注册于 ${formatDate(profile.value.created_at, 'yyyy-MM-dd')}`
})

async function loadProfile() {
  profileError.value = false
  const storedToken = authStore.token
  if (!storedToken) {
    router.push('/login')
    return
  }
  loadAbort?.abort()
  loadAbort = new AbortController()
  profileLoading.value = true
  try {
    const res = await api.get<{ success: boolean; data: UserProfile }>('/user/profile', {
      signal: loadAbort.signal,
    })
    profile.value = res.data.data
    authStore.setAuth(
      storedToken,
      res.data.data.role,
      {
        id: res.data.data.id,
        username: res.data.data.username,
        role: res.data.data.role,
        avatar: res.data.data.avatar,
      }
    )
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    console.error('Profile load failed', err)
    profileError.value = true
    Swal.fire({
      toast: true,
      position: 'top',
      icon: 'error',
      title: '加载失败，请重试',
      showConfirmButton: false,
      timer: 2500,
    })
  } finally {
    profileLoading.value = false
  }
}

function triggerAvatarUpload() {
  avatarInput.value?.click()
}

async function handleAvatarChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext || '') ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    Swal.fire('格式不支持', '请选择 JPEG / PNG / WebP 格式的图片', 'warning')
    avatarInput.value!.value = ''
    return
  }
  if (file.size > 2 * 1024 * 1024) {
    Swal.fire('文件过大', '头像图片不能超过 2MB', 'warning')
    avatarInput.value!.value = ''
    return
  }

  const formData = new FormData()
  formData.append('avatar', file)
  uploadAbort?.abort()
  uploadAbort = new AbortController()
  try {
    const res = await api.post<{ success: boolean; data: { url: string } }>('/upload/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: uploadAbort.signal,
    })
    const url = res.data.data.url
    if (!isValidAvatarUrl(url)) {
      Swal.fire('上传异常', '头像地址无效', 'error')
      return
    }
    await api.put('/user/profile', { avatar: url })
    if (profile.value) profile.value.avatar = url
    authStore.setProfile({ avatar: url })
    Swal.fire('上传成功', '', 'success')
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    Swal.fire('上传失败', '请稍后重试', 'error')
  } finally {
    avatarInput.value!.value = ''
  }
}

function onEditProfile() {
  const currentUsername = profile.value?.username || authStore.user?.username || ''
  void Swal.fire<string>({
    title: '编辑资料',
    html: '<p style="text-align:left;font-size:14px;margin-bottom:8px;color:#666">修改用户名：</p>',
    input: 'text',
    inputValue: currentUsername,
    inputAttributes: {
      maxlength: '50',
      'aria-label': '输入新用户名',
    },
    showCancelButton: true,
    confirmButtonText: '保存',
    cancelButtonText: '取消',
    showLoaderOnConfirm: true,
    inputValidator: (value) => {
      if (!value || !value.trim()) return '用户名不能为空'
      const trimmed = value.trim()
      if (trimmed.length < 3 || trimmed.length > 50) return '用户名长度需在 3-50 个字符之间'
      if (!/^[a-zA-Z0-9_一-龥]+$/.test(trimmed)) return '用户名仅允许字母、数字、下划线和汉字'
      if (trimmed === currentUsername) return '新用户名与当前用户名相同'
      return null
    },
    preConfirm: async (newName) => {
      try {
        const res = await api.put<{ success: boolean; data: { id: number; username: string } }>('/user/profile', { username: newName.trim() })
        return res.data.data.username
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'response' in err) {
          const axiosErr = err as { response?: { status?: number; data?: { message?: string } } }
          if (axiosErr.response?.status === 409) {
            Swal.showValidationMessage('该用户名已被使用')
            return
          }
          if (axiosErr.response?.status === 422) {
            Swal.showValidationMessage(axiosErr.response.data?.message || '用户名格式不正确')
            return
          }
        }
        Swal.showValidationMessage('修改失败，请检查网络后重试')
      }
    },
  }).then((result) => {
    if (result.isConfirmed && result.value) {
      const newUsername = result.value
      if (profile.value) profile.value.username = newUsername
      authStore.setProfile({ username: newUsername })
      Swal.fire({ toast: true, position: 'top', icon: 'success', title: '用户名已更新', showConfirmButton: false, timer: 2000 })
    }
  })
}

async function handleLogout() {
  const result = await Swal.fire({
    title: '确认退出',
    text: '退出后需要重新登录',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: '退出',
    cancelButtonText: '取消',
    confirmButtonColor: '#FF4D4F',
  })
  if (!result.isConfirmed) return

  try {
    const { useChatStore } = await import('@/stores/chatStore')
    const chatStore = useChatStore()
    chatStore.abortActiveConnection?.()
    chatStore.clearAllConversations?.()
  } catch { /* chatStore 尚未创建 */ }

  riskFormStore.reset()
  await authStore.logout()
  router.push('/home')
}

interface MenuItem {
  label: string
  icon: string
  iconColor: string
  bgColor: string
  to?: string
  action?: () => void
  admin?: boolean
}

const menuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [
    {
      label: '风险预测',
      icon: 'fa-heart-pulse',
      iconColor: '#4A90D9',
      bgColor: '#E8F1FB',
      to: '/profile/risk',
    },
    {
      label: '打卡记录',
      icon: 'fa-clipboard-check',
      iconColor: '#52C41A',
      bgColor: '#F0F9EB',
      to: '/profile/punch',
    },
    {
      label: '健康建议',
      icon: 'fa-lightbulb',
      iconColor: '#FAAD14',
      bgColor: '#FFFBE6',
      to: '/profile/advice',
    },
    {
      label: '编辑资料',
      icon: 'fa-user-edit',
      iconColor: '#4A90D9',
      bgColor: '#E8F1FB',
      action: onEditProfile,
    },
  ]
  if (authStore.isAdmin) {
    items.push({
      label: '智能管理',
      icon: 'fa-shield-halved',
      iconColor: '#7C3AED',
      bgColor: '#F3E8FF',
      to: '/admin',
    })
  }
  return items
})

function onMenuClick(item: MenuItem) {
  if (item.action) {
    item.action()
    return
  }
  if (item.to) {
    router.push(item.to)
  }
}

onMounted(loadProfile)
onUnmounted(() => {
  loadAbort?.abort()
  uploadAbort?.abort()
})
</script>

<template>
  <div class="profile-page">
    <router-view v-if="isSubRouteActive" />

    <div v-else class="profile-main-view">
      <!-- 加载骨架屏 -->
      <template v-if="profileLoading">
        <div class="profile-hero skeleton-hero" aria-hidden="true">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-line skeleton-name"></div>
          <div class="skeleton-line skeleton-meta"></div>
        </div>
        <div class="profile-body">
          <div class="stats-row">
            <div v-for="n in 3" :key="`ss-${n}`" class="stat-card skeleton-stat"></div>
          </div>
          <div class="menu-grid">
            <div v-for="n in 4" :key="`ms-${n}`" class="menu-card skeleton-menu"></div>
          </div>
          <div class="logout-area skeleton-logout"></div>
        </div>
      </template>

      <!-- 错误重试 -->
      <div v-else-if="profileError" class="profile-error" role="alert">
        <div class="error-icon">
          <i class="fa-solid fa-circle-exclamation"></i>
        </div>
        <p class="error-title">资料加载失败</p>
        <p class="error-desc">请检查网络后重试</p>
        <button class="retry-button" @click="loadProfile">
          <i class="fa-solid fa-rotate-right"></i>
          重新加载
        </button>
      </div>

      <!-- 正常内容 -->
      <template v-else>
        <header class="profile-hero">
          <div class="hero-bg" aria-hidden="true">
            <div class="hero-bubble hero-bubble-1"></div>
            <div class="hero-bubble hero-bubble-2"></div>
            <div class="hero-bubble hero-bubble-3"></div>
          </div>

          <div class="hero-content">
            <div class="avatar-wrapper" @click="triggerAvatarUpload">
              <img
                :src="profile?.avatar && isValidAvatarUrl(profile.avatar) ? profile.avatar : defaultAvatar"
                alt="用户头像"
                referrerpolicy="no-referrer"
                class="avatar-img"
              />
              <div class="avatar-overlay" aria-hidden="true">
                <i class="fa-solid fa-camera"></i>
              </div>
              <input
                ref="avatarInput"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                class="hidden-input"
                @change="handleAvatarChange"
              />
            </div>

            <div class="user-info">
              <h1 class="user-name">{{ displayName }}</h1>
              <div class="user-meta">
                <span class="role-badge" :class="{ admin: authStore.isAdmin }">
                  {{ roleText }}
                </span>
                <span v-if="joinDateText" class="join-date">{{ joinDateText }}</span>
              </div>
            </div>
          </div>
        </header>

        <main class="profile-body">
          <!-- 数据概览 -->
          <section class="stats-row" aria-label="健康数据概览">
            <article class="stat-card">
              <span class="stat-value">{{ memberDays }}</span>
              <span class="stat-label">注册天数</span>
            </article>
            <article class="stat-card">
              <span class="stat-value stat-placeholder">--</span>
              <span class="stat-label">健康评分</span>
            </article>
            <article class="stat-card">
              <span class="stat-value stat-placeholder">--</span>
              <span class="stat-label">连续打卡</span>
            </article>
          </section>

          <!-- 功能菜单 -->
          <section class="menu-section" aria-label="功能菜单">
            <div class="section-head">
              <h2 class="section-title">常用功能</h2>
            </div>
            <div class="menu-grid" role="list">
              <button
                v-for="item in menuItems"
                :key="item.label"
                class="menu-card press"
                role="listitem"
                @click="onMenuClick(item)"
              >
                <div class="menu-icon-wrap" :style="{ background: item.bgColor }">
                  <i
                    class="fa-solid menu-icon"
                    :class="item.icon"
                    :style="{ color: item.iconColor }"
                    aria-hidden="true"
                  ></i>
                </div>
                <span class="menu-label">{{ item.label }}</span>
                <i class="fa-solid fa-chevron-right menu-arrow" aria-hidden="true"></i>
              </button>
            </div>
          </section>

          <!-- 退出登录 -->
          <section class="logout-area">
            <button class="logout-button press" @click="handleLogout">
              <i class="fa-solid fa-sign-out-alt" aria-hidden="true"></i>
              <span>退出登录</span>
            </button>
          </section>
        </main>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* ========== 页面容器 ========== */
.profile-page {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--color-bg);
  position: relative;
}

.profile-main-view {
  animation: profileEnter 0.35s ease-out;
  padding-bottom: calc(var(--tab-bar-height) + 16px);
}

@keyframes profileEnter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .profile-main-view {
    animation: none;
  }
}

/* ========== Hero 头部 ========== */
.profile-hero {
  position: relative;
  padding: 52px var(--spacing-lg) 32px;
  overflow: hidden;
  background: linear-gradient(135deg, #4A90D9 0%, #3A7BC8 100%);
  border-bottom-left-radius: 24px;
  border-bottom-right-radius: 24px;
  box-shadow: 0 8px 24px rgba(74, 144, 217, 0.28);
}

.hero-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.hero-bubble {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
}

.hero-bubble-1 {
  width: 160px;
  height: 160px;
  top: -40px;
  right: -30px;
}

.hero-bubble-2 {
  width: 96px;
  height: 96px;
  bottom: 20px;
  left: -20px;
}

.hero-bubble-3 {
  width: 48px;
  height: 48px;
  top: 60px;
  right: 110px;
  background: rgba(255, 255, 255, 0.2);
}

.hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

/* ========== 头像 ========== */
.avatar-wrapper {
  position: relative;
  width: 104px;
  height: 104px;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  padding: 4px;
  background: rgba(255, 255, 255, 0.35);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  transition: transform var(--transition-fast);
}

.avatar-wrapper:active {
  transform: scale(0.96);
}

.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid #fff;
  background: #fff;
}

.avatar-overlay {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.avatar-overlay i {
  color: #fff;
  font-size: 24px;
}

.avatar-wrapper:hover .avatar-overlay,
.avatar-wrapper:focus-within .avatar-overlay {
  opacity: 1;
}

.hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

/* ========== 用户信息 ========== */
.user-info {
  margin-top: var(--spacing-md);
  color: #fff;
}

.user-name {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.user-meta {
  margin-top: var(--spacing-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.35);
}

.role-badge.admin {
  background: rgba(124, 58, 237, 0.35);
  border-color: rgba(124, 58, 237, 0.55);
}

.join-date {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
}

/* ========== 页面主体 ========== */
.profile-body {
  padding: 0 var(--spacing-lg);
  margin-top: -24px;
  position: relative;
  z-index: 2;
}

/* ========== 数据概览 ========== */
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xl);
}

.stat-card {
  background: var(--color-card);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md) var(--spacing-sm);
  text-align: center;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--color-divider);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1.2;
}

.stat-value.stat-placeholder {
  color: var(--color-text-disabled);
}

.stat-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  line-height: 1.2;
}

/* ========== 菜单区块 ========== */
.menu-section {
  margin-bottom: var(--spacing-xl);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
  padding: 0 2px;
}

.section-title {
  font-size: var(--font-size-h3);
  font-weight: 700;
  color: var(--color-text-primary);
}

.menu-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-md);
}

.menu-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--color-divider);
  cursor: pointer;
  text-align: left;
  transition: box-shadow var(--transition-fast), transform var(--transition-fast);
  width: 100%;
}

.menu-card:hover,
.menu-card:focus {
  box-shadow: var(--shadow-md);
}

.menu-card:active {
  transform: scale(0.98);
}

.menu-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.menu-icon {
  font-size: 20px;
}

.menu-label {
  flex: 1;
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  font-weight: 500;
}

.menu-arrow {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

/* ========== 退出登录 ========== */
.logout-area {
  margin-top: var(--spacing-xl);
}

.logout-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: 14px var(--spacing-lg);
  background: var(--color-card);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-lg);
  color: var(--color-danger);
  font-size: var(--font-size-body);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.logout-button:hover,
.logout-button:focus {
  background: #fff1f0;
}

.logout-button:active {
  transform: scale(0.98);
}

/* ========== 错误重试 ========== */
.profile-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: var(--spacing-2xl);
  text-align: center;
}

.error-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: #fff1f0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-md);
}

.error-icon i {
  font-size: 32px;
  color: var(--color-danger);
}

.error-title {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
}

.error-desc {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xl);
}

.retry-button {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 10px 24px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-button);
  font-size: var(--font-size-body);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.retry-button:hover,
.retry-button:focus {
  background: var(--color-primary-dark);
}

/* ========== 骨架屏 ========== */
.skeleton-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(135deg, #9fc7ed 0%, #7cace0 100%);
  pointer-events: none;
}

.skeleton-avatar {
  width: 104px;
  height: 104px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
}

.skeleton-line {
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.35);
  margin-top: var(--spacing-sm);
}

.skeleton-name {
  width: 120px;
  height: 20px;
  margin-top: var(--spacing-md);
}

.skeleton-meta {
  width: 160px;
  height: 14px;
}

.skeleton-stat {
  min-height: 78px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeletonShimmer 1.2s infinite linear;
}

.skeleton-menu {
  min-height: 76px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeletonShimmer 1.2s infinite linear;
  border: none;
}

.skeleton-logout {
  height: 50px;
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeletonShimmer 1.2s infinite linear;
}

@keyframes skeletonShimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-stat,
  .skeleton-menu,
  .skeleton-logout {
    animation: none;
  }
}
</style>
