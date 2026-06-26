<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const tabs = [
  { path: '/home', label: '首页', icon: 'fa-home' },
  { path: '/consultation', label: '咨询', icon: 'fa-user-md' },
  { path: '/life-plan', label: '生活方案', icon: 'fa-clipboard-list' },
  { path: '/news', label: '资讯', icon: 'fa-newspaper' },
  { path: '/profile', label: '我的', icon: 'fa-user' },
]

function isActive(tabPath: string): boolean {
  return route.path === tabPath || route.path.startsWith(tabPath + '/')
}

const showTabBar = computed(() => {
  const noTabRoutes = ['/login', '/change-password', '/admin']
  return !noTabRoutes.some((r) => route.path.startsWith(r))
})

// 跨标签页登录态同步
function handleStorageChange(e: StorageEvent) {
  if (e.key === 'token' || e.key === 'role' || e.key === 'user') {
    const newToken = localStorage.getItem('token')
    const newRole = localStorage.getItem('role')
    if (!newToken || (newRole !== 'user' && newRole !== 'admin')) {
      authStore.clearAuth()
      router.push('/login')
    } else {
      authStore.syncFromStorage()
    }
  }
}

onMounted(() => {
  window.addEventListener('storage', handleStorageChange)
})

onUnmounted(() => {
  window.removeEventListener('storage', handleStorageChange)
})
</script>

<template>
  <div class="app-root">
    <router-view />

    <nav
      v-if="showTabBar"
      class="tab-bar fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 z-50 flex items-center justify-around"
      style="padding-bottom: env(safe-area-inset-bottom)"
    >
      <router-link
        v-for="tab in tabs"
        :key="tab.path"
        :to="tab.path"
        class="tab-item flex flex-col items-center justify-center flex-1 h-full transition"
      >
        <i
          :class="['fas', tab.icon, 'text-lg mb-0.5']"
          :style="{ color: isActive(tab.path) ? '#4A90D9' : '#9CA3AF' }"
        ></i>
        <span
          class="text-[10px]"
          :style="{ color: isActive(tab.path) ? '#4A90D9' : '#9CA3AF' }"
        >{{ tab.label }}</span>
      </router-link>
    </nav>
  </div>
</template>
