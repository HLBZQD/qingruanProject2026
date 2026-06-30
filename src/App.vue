<script setup lang="ts">
import { computed } from 'vue'
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
  { path: '/home', label: '首页', icon: 'diabetes', iconType: 'diabetes' as const },
  { path: '/consultation', label: '咨询', icon: 'stethoscope', iconType: 'diabetes' as const },
  { path: '/life-plan', label: '生活方案', icon: 'pills', iconType: 'diabetes' as const },
  { path: '/news', label: '资讯', icon: 'medical-note', iconType: 'diabetes' as const },
  { path: '/profile', label: '我的', icon: 'home-care', iconType: 'diabetes' as const },
]

const showTabBar = computed(() => {
  const noTabRoutes = ['/login', '/change-password', '/admin']
  return !noTabRoutes.some((r) => route.path.startsWith(r))
})

const showFab = computed(() => {
  return route.path !== '/login' && route.path !== '/change-password'
})

function toggleFab() {
  chatStore.toggleFab()
}
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
