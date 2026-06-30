<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useRiskFormStore } from '@/stores/riskFormStore'
import { api } from '@/composables/useApi'
import { formatDate } from '@/utils/helpers'
import Swal from 'sweetalert2'
import AppIcon from '@/components/icons/AppIcon.vue'
import DiabetesIcon from '@/components/icons/DiabetesIcon.vue'
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
    html: '<p style="text-align:left;font-size:14px;margin-bottom:8px;color:#4B5563">修改用户名：</p>',
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
    confirmButtonColor: '#EF4444',
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
  iconType?: 'app' | 'diabetes'
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
      icon: 'diagnose-heart',
      iconType: 'diabetes',
      iconColor: '#4F46E5',
      bgColor: '#EEF2FF',
      to: '/profile/risk',
    },
    {
      label: '打卡记录',
      icon: 'medical-note',
      iconType: 'diabetes',
      iconColor: '#06D6A0',
      bgColor: '#E0FDF6',
      to: '/profile/punch',
    },
    {
      label: '健康建议',
      icon: 'lightbulb',
      iconType: 'app',
      iconColor: '#FF6B6B',
      bgColor: '#FFF0F0',
      to: '/profile/advice',
    },
    {
      label: '编辑资料',
      icon: 'doctor-notes',
      iconType: 'diabetes',
      iconColor: '#4F46E5',
      bgColor: '#EEF2FF',
      action: onEditProfile,
    },
  ]
  if (authStore.isAdmin) {
    items.push({
      label: '智能管理',
      icon: 'medical-sign',
      iconType: 'diabetes',
      iconColor: '#8B5CF6',
      bgColor: '#EDE9FE',
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
          <div class="hero-grid" aria-hidden="true"></div>
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
          <AppIcon name="exclamation" :size="32" />
        </div>
        <p class="error-title">资料加载失败</p>
        <p class="error-desc">请检查网络后重试</p>
        <button class="retry-button" @click="loadProfile">
          <AppIcon name="refresh" :size="16" />
          重新加载
        </button>
      </div>

      <!-- 正常内容 -->
      <template v-else>
        <header class="profile-hero">
          <div class="hero-grid" aria-hidden="true"></div>
          <div class="hero-shapes" aria-hidden="true">
            <span class="hero-shape hero-shape-1"></span>
            <span class="hero-shape hero-shape-2"></span>
            <span class="hero-shape hero-shape-3"></span>
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
                <AppIcon name="camera" :size="24" color="#fff" />
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
          <div class="hero-wave" aria-hidden="true">
            <svg viewBox="0 0 400 36" preserveAspectRatio="none">
              <path d="M0,0 L0,16 Q100,34 200,22 T400,16 L400,0 Z" fill="var(--color-bg)" />
            </svg>
          </div>
        </header>

        <main class="profile-body">
          <!-- 数据概览 -->
          <section class="stats-row" aria-label="健康数据概览">
            <article class="stat-card stat-card-indigo">
              <div class="stat-icon-wrap">
                <AppIcon name="calendar" :size="18" color="#fff" />
              </div>
              <span class="stat-value font-mono">{{ memberDays }}</span>
              <span class="stat-label">注册天数</span>
            </article>
            <article class="stat-card stat-card-mint">
              <div class="stat-icon-wrap">
                <AppIcon name="heart" :size="18" color="#fff" />
              </div>
              <span class="stat-value font-mono stat-placeholder">--</span>
              <span class="stat-label">健康评分</span>
            </article>
            <article class="stat-card stat-card-coral">
              <div class="stat-icon-wrap">
                <AppIcon name="check-in" :size="18" color="#fff" />
              </div>
              <span class="stat-value font-mono stat-placeholder">--</span>
              <span class="stat-label">连续打卡</span>
            </article>
          </section>

          <!-- 功能菜单 -->
          <section class="menu-section" aria-label="功能菜单">
            <div class="section-head">
              <div class="section-title-wrap">
                <span class="section-icon-wrap">
                  <AppIcon name="sliders" :size="16" color="#fff" />
                </span>
                <h2 class="section-title">常用功能</h2>
              </div>
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
                  <AppIcon
                    v-if="!item.iconType || item.iconType === 'app'"
                    :name="item.icon"
                    :size="20"
                    :color="item.iconColor"
                    class="menu-icon"
                  />
                  <DiabetesIcon
                    v-else
                    :name="item.icon"
                    :size="20"
                    :color="item.iconColor"
                    class="menu-icon"
                  />
                </div>
                <span class="menu-label">{{ item.label }}</span>
                <AppIcon name="chevron-right" :size="12" color="#9CA3AF" class="menu-arrow" />
              </button>
            </div>
          </section>

          <!-- 退出登录 -->
          <section class="logout-area">
            <button class="logout-button press" @click="handleLogout">
              <AppIcon name="sign-out" :size="18" />
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
  padding: 52px var(--spacing-lg) 36px;
  overflow: hidden;
  background: var(--color-primary);
  box-shadow: var(--shadow-primary);
}

.hero-grid {
  position: absolute;
  inset: 0;
  opacity: 0.08;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.5) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.5) 1px, transparent 1px);
  background-size: 28px 28px;
  pointer-events: none;
}

.hero-shapes {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.hero-shape {
  position: absolute;
  border-radius: 24%;
}

.hero-shape-1 {
  width: 120px;
  height: 120px;
  background: var(--color-vivid);
  opacity: 0.15;
  top: -40px;
  right: -20px;
  transform: rotate(20deg);
}

.hero-shape-2 {
  width: 80px;
  height: 80px;
  background: var(--color-accent);
  opacity: 0.2;
  bottom: 40px;
  left: -20px;
  transform: rotate(-15deg);
}

.hero-shape-3 {
  width: 48px;
  height: 48px;
  background: var(--color-amber);
  opacity: 0.2;
  top: 30px;
  right: 25%;
  border-radius: 30%;
}

.hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.hero-wave {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 32px;
  transform: translateY(1px);
}

.hero-wave svg {
  width: 100%;
  height: 100%;
  display: block;
}

/* ========== 头像 ========== */
.avatar-wrapper {
  position: relative;
  width: 108px;
  height: 108px;
  border-radius: 30%;
  cursor: pointer;
  flex-shrink: 0;
  padding: 4px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow: 0 0 0 4px rgba(6, 214, 160, 0.18);
  transition: transform var(--transition-fast);
  transform: rotate(2deg);
}

.avatar-wrapper:active {
  transform: rotate(0deg) scale(0.96);
}

.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 28%;
  object-fit: cover;
  border: 3px solid #fff;
  background: #fff;
}

.avatar-overlay {
  position: absolute;
  inset: 4px;
  border-radius: 28%;
  background: rgba(26, 26, 46, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-fast);
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
  letter-spacing: -0.02em;
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
  border-radius: var(--radius-tag);
  font-size: var(--font-size-xs);
  font-weight: 600;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.role-badge.admin {
  background: rgba(6, 214, 160, 0.25);
  border-color: rgba(6, 214, 160, 0.45);
}

.join-date {
  font-size: var(--font-size-caption);
  color: rgba(255, 255, 255, 0.8);
}

/* ========== 页面主体 ========== */
.profile-body {
  padding: 0 var(--spacing-lg);
  margin-top: -20px;
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
  position: relative;
  border-radius: var(--radius-xl);
  padding: var(--spacing-sm) var(--spacing-md) var(--spacing-md);
  text-align: center;
  box-shadow: var(--shadow-sm);
  border: 1.5px solid var(--color-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  background: var(--color-card);
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
}

.stat-card-indigo::before { background: var(--color-primary); }
.stat-card-mint::before { background: var(--color-accent); }
.stat-card-coral::before { background: var(--color-vivid); }

.stat-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
}

.stat-card-indigo .stat-icon-wrap { background: var(--color-primary); }
.stat-card-mint .stat-icon-wrap { background: var(--color-accent); }
.stat-card-coral .stat-icon-wrap { background: var(--color-vivid); }

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.stat-value.stat-placeholder {
  color: var(--color-text-disabled);
}

.stat-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1.2;
  font-weight: 500;
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

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-icon-wrap {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.section-title {
  font-size: var(--font-size-h3);
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: -0.01em;
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
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  border: 1.5px solid var(--color-border);
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
  border-radius: var(--radius-sm);
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
  font-weight: 600;
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
  border: 1.5px solid var(--color-danger);
  border-radius: var(--radius-xl);
  color: var(--color-danger);
  font-size: var(--font-size-body);
  font-weight: 700;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.logout-button:hover,
.logout-button:focus {
  background: var(--color-danger-light);
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
  border-radius: 30%;
  background: var(--color-danger-light);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-md);
  color: var(--color-danger);
  transform: rotate(3deg);
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
  font-weight: 700;
  cursor: pointer;
  transition: background var(--transition-fast);
  box-shadow: var(--shadow-primary);
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
  background: var(--color-primary);
  pointer-events: none;
}

.skeleton-avatar {
  width: 108px;
  height: 108px;
  border-radius: 30%;
  background: rgba(255, 255, 255, 0.2);
}

.skeleton-line {
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.2);
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
  min-height: 96px;
  background: linear-gradient(90deg, var(--color-divider) 25%, #F5F2EF 50%, var(--color-divider) 75%);
  background-size: 200% 100%;
  animation: skeletonShimmer 1.2s infinite linear;
  border-radius: var(--radius-xl);
}

.skeleton-menu {
  min-height: 76px;
  background: linear-gradient(90deg, var(--color-divider) 25%, #F5F2EF 50%, var(--color-divider) 75%);
  background-size: 200% 100%;
  animation: skeletonShimmer 1.2s infinite linear;
  border: none;
  border-radius: var(--radius-xl);
}

.skeleton-logout {
  height: 50px;
  border-radius: var(--radius-xl);
  background: linear-gradient(90deg, var(--color-divider) 25%, #F5F2EF 50%, var(--color-divider) 75%);
  background-size: 200% 100%;
  animation: skeletonShimmer 1.2s infinite linear;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-stat,
  .skeleton-menu,
  .skeleton-logout {
    animation: none;
  }
}
</style>
