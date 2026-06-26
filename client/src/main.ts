import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './assets/variables.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// 自动从 localStorage 恢复登录态
import { useAuthStore } from '@/stores/authStore'
const authStore = useAuthStore()
authStore.syncFromStorage()

app.mount('#app')
