<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useRiskFormStore } from '@/stores/riskFormStore'
import { api } from '@/composables/useApi'
import Swal from 'sweetalert2'
import type { UserProfile } from '@/types/api'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const riskFormStore = useRiskFormStore()

const profile = ref<UserProfile | null>(null)
const profileError = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
let loadAbort: AbortController | null = null
let uploadAbort: AbortController | null = null

const isSubRouteActive = computed(() => route.path !== '/profile')
const defaultAvatar = '/static/images/default/default-avatar.png'

function isValidAvatarUrl(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//')
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function loadProfile() {
  profileError.value = false
  const storedToken = authStore.token
  if (!storedToken) {
    router.push('/login')
    return
  }
  loadAbort?.abort()
  loadAbort = new AbortController()
  try {
    const res = await api.get<{ success: boolean; data: UserProfile }>('/user/profile', {
      signal: loadAbort.signal,
    })
    profile.value = res.data.data
    authStore.setAuth(
      storedToken,
      res.data.data.role,
      { id: res.data.data.id, username: res.data.data.username, role: res.data.data.role, avatar: res.data.data.avatar }
    )
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    console.error('Profile load failed', err)
    profileError.value = true
    Swal.fire({ toast: true, position: 'top', icon: 'error', title: '加载失败，请重试', showConfirmButton: false, timer: 2500 })
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
  Swal.fire({ toast: true, position: 'top', icon: 'info', title: '编辑资料功能开发中', showConfirmButton: false, timer: 2000 })
}

async function handleLogout() {
  const result = await Swal.fire({
    title: '确认退出',
    text: '退出后需要重新登录',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: '退出',
    cancelButtonText: '取消',
  })
  if (!result.isConfirmed) return

  // 按设计顺序清理：先中止 SSE 连接、清除对话、清除表单，最后清除认证
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

onMounted(loadProfile)
onUnmounted(() => {
  loadAbort?.abort()
  uploadAbort?.abort()
})
</script>

<template>
  <div class="profile-container min-h-screen bg-[#F5F5F5] pb-20">
    <router-view v-if="isSubRouteActive" />

    <div v-else class="profile-main-view">
      <header class="profile-header flex flex-col items-center pt-8 pb-6 bg-white shadow-sm">
        <div class="avatar-wrapper relative cursor-pointer mb-3" @click="triggerAvatarUpload">
          <img
            :src="profile?.avatar && isValidAvatarUrl(profile.avatar) ? profile.avatar : defaultAvatar"
            alt="头像"
            referrerpolicy="no-referrer"
            class="avatar-img w-[100px] h-[100px] rounded-full object-cover border-2 border-gray-200"
          />
          <div class="avatar-overlay absolute inset-0 rounded-full bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition">
            <i class="fas fa-camera text-white text-xl"></i>
          </div>
        </div>
        <input
          ref="avatarInput"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          class="hidden"
          @change="handleAvatarChange"
        />
        <h2 class="text-lg font-semibold text-[#333]">
          {{ profile?.username || authStore.user?.username || '用户' }}
        </h2>
        <p class="text-sm text-gray-500 mt-1">
          {{ authStore.role === 'admin' ? '管理员' : '普通用户' }}
          <span v-if="profile?.created_at" class="ml-2">· 注册于 {{ formatDate(profile.created_at) }}</span>
        </p>
        <p v-if="profileError" class="text-xs text-[#FF4D4F] mt-2">
          加载失败，<span class="underline cursor-pointer" @click="loadProfile">点击重试</span>
        </p>
      </header>

      <section class="profile-menu mt-3 bg-white">
        <router-link to="/profile/risk" class="menu-item flex items-center px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition">
          <i class="fas fa-heart-pulse text-[#4A90D9] w-6 text-center"></i>
          <span class="flex-1 ml-3 text-sm">糖尿病风险预测</span>
          <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
        </router-link>

        <router-link to="/profile/punch" class="menu-item flex items-center px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition">
          <i class="fas fa-clipboard-check text-[#4A90D9] w-6 text-center"></i>
          <span class="flex-1 ml-3 text-sm">打卡记录与分析</span>
          <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
        </router-link>

        <router-link to="/profile/advice" class="menu-item flex items-center px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition">
          <i class="fas fa-lightbulb text-[#4A90D9] w-6 text-center"></i>
          <span class="flex-1 ml-3 text-sm">健康建议</span>
          <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
        </router-link>

        <a class="menu-item flex items-center px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition cursor-pointer" @click="onEditProfile">
          <i class="fas fa-user-edit text-[#4A90D9] w-6 text-center"></i>
          <span class="flex-1 ml-3 text-sm">编辑资料</span>
          <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
        </a>

        <router-link
          v-if="authStore.isAdmin"
          to="/admin"
          class="menu-item flex items-center px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition"
        >
          <i class="fas fa-shield-halved text-[#4A90D9] w-6 text-center"></i>
          <span class="flex-1 ml-3 text-sm">智能管理</span>
          <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
        </router-link>

        <a class="menu-item flex items-center px-4 py-3.5 hover:bg-gray-50 transition cursor-pointer" @click="handleLogout">
          <i class="fas fa-sign-out-alt text-[#FF4D4F] w-6 text-center"></i>
          <span class="flex-1 ml-3 text-sm text-[#FF4D4F]">退出登录</span>
        </a>
      </section>
    </div>
  </div>
</template>

<style scoped>
.profile-main-view {
  animation: fadeIn 0.25s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
