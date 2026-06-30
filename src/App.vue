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
