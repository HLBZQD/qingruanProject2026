<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import TabBar from '@/components/TabBar.vue'
import FabButton from '@/components/FabButton.vue'
import AiChatDialog from '@/components/AiChatDialog.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()

const tabs = [
  { path: '/home', label: '首页', icon: 'fa-home' },
  { path: '/consultation', label: '咨询', icon: 'fa-user-md' },
  { path: '/life-plan', label: '生活方案', icon: 'fa-clipboard-list' },
  { path: '/news', label: '资讯', icon: 'fa-newspaper' },
  { path: '/profile', label: '我的', icon: 'fa-user' },
]

const showTabBar = computed(() => {
  const noTabRoutes = ['/login', '/change-password', '/admin']
  return !noTabRoutes.some((r) => route.path.startsWith(r))
})

const showFab = computed(() => {
  return route.path !== '/login' && route.path !== '/change-password'
})

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

function toggleFab() {
  chatStore.toggleFab()
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

    <TabBar v-if="showTabBar" :tabs="tabs" />
    <FabButton v-if="showFab" :open="chatStore.fabOpen" @click="toggleFab" />
    <AiChatDialog />
  </div>
</template>

<style scoped>
.app-root {
  min-height: 100vh;
  background: var(--color-bg);
}
</style>
