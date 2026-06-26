<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
const avatarInput = ref<HTMLInputElement | null>(null)

const isSubRouteActive = computed(() => route.path !== '/profile')

async function loadProfile() {
  try {
    const res = await api.get<{ success: boolean; data: UserProfile }>('/user/profile')
    profile.value = res.data.data
    authStore.role = res.data.data.role
  } catch {
    // 静默降级，展示 authStore 中的缓存数据
  }
}

function triggerAvatarUpload() {
  avatarInput.value?.click()
}

async function handleAvatarChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    Swal.fire('格式不支持', '请选择 JPEG / PNG / WebP 格式的图片', 'warning')
    return
  }
  if (file.size > 2 * 1024 * 1024) {
    Swal.fire('文件过大', '头像图片不能超过 2MB', 'warning')
    return
  }

  const formData = new FormData()
  formData.append('avatar', file)
  try {
    const res = await api.post<{ success: boolean; data: { url: string } }>('/upload/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    const url = res.data.data.url
    await api.put('/user/profile', { avatar: url })
    if (profile.value) profile.value.avatar = url
    Swal.fire('上传成功', '', 'success')
  } catch {
    Swal.fire('上传失败', '请稍后重试', 'error')
  }
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

  riskFormStore.reset()
  await authStore.logout()
  router.push('/home')
}

onMounted(loadProfile)
</script>

<template>
  <div class="profile-container min-h-screen bg-[#F5F5F5] pb-20">
    <!-- 子路由出口 -->
    <router-view v-if="isSubRouteActive" />

    <!-- 个人中心主页 -->
    <div v-else class="profile-main-view">
      <!-- 头部用户信息 -->
      <header class="profile-header flex flex-col items-center pt-8 pb-6 bg-white shadow-sm">
        <div
          class="avatar-wrapper relative cursor-pointer mb-3"
          @click="triggerAvatarUpload"
        >
          <img
            :src="profile?.avatar || 'https://via.placeholder.com/100'"
            alt="头像"
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
        </p>
      </header>

      <!-- 功能菜单 -->
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

        <a class="menu-item flex items-center px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition cursor-pointer">
          <i class="fas fa-user-edit text-[#4A90D9] w-6 text-center"></i>
          <span class="flex-1 ml-3 text-sm">编辑资料</span>
          <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
        </a>

        <router-link
          v-if="authStore.isAdmin"
          to="/admin"
          class="menu-item flex items-center px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 transition"
        >
          <i class="fas fa-shield-haltered text-[#4A90D9] w-6 text-center"></i>
          <span class="flex-1 ml-3 text-sm">智能管理</span>
          <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
        </router-link>

        <a
          class="menu-item flex items-center px-4 py-3.5 hover:bg-gray-50 transition cursor-pointer"
          @click="handleLogout"
        >
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
