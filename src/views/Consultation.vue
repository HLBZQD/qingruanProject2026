<!-- src/views/Consultation.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getDoctors } from '@/composables/useHomeApi'
import type { Doctor } from '@/types/api'

const router = useRouter()
const doctors = ref<Doctor[]>([])
const loading = ref(true)
const error = ref('')

async function fetchDoctors() {
  loading.value = true
  error.value = ''
  try {
    doctors.value = await getDoctors()
  } catch (err: unknown) {
    error.value =
      (err as { message?: string }).message || '获取医生列表失败，请检查网络后重试'
  } finally {
    loading.value = false
  }
}

function goToChat(doctorId: number) {
  router.push(`/consultation/doctor/${doctorId}`)
}

onMounted(() => {
  fetchDoctors()
})
</script>

<template>
  <div class="consultation-list-container">
    <!-- 顶部导航栏 -->
    <header class="top-bar">
      <h1>医师咨询</h1>
    </header>

    <!-- 加载态 -->
    <div v-if="loading" class="loading-state">
      <div class="skeleton-card" v-for="n in 3" :key="n">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-lines">
          <div class="skeleton-line skeleton-name"></div>
          <div class="skeleton-line skeleton-dept"></div>
          <div class="skeleton-line skeleton-desc"></div>
        </div>
      </div>
    </div>

    <!-- 错误态 -->
    <div v-else-if="error" class="error-state">
      <i class="fas fa-exclamation-circle error-icon"></i>
      <p>{{ error }}</p>
      <button @click="fetchDoctors" class="btn-retry">重试</button>
    </div>

    <!-- 空态 -->
    <div v-else-if="doctors.length === 0" class="empty-state">
      <i class="fas fa-user-md empty-icon"></i>
      <p>暂无在线医生</p>
    </div>

    <!-- 医生列表 -->
    <div v-else id="doctor-list">
      <div
        v-for="doctor in doctors"
        :key="doctor.id"
        class="doctor-card-detail"
        @click="goToChat(doctor.id)"
      >
        <img
          class="doctor-avatar-large"
          :src="doctor.avatar || '/default-avatar.png'"
          :alt="doctor.name"
        />
        <div class="doctor-info">
          <h2>
            {{ doctor.name }}
            <span
              v-if="(doctor as any).is_online !== false"
              class="online-badge"
            >在线</span>
          </h2>
          <p class="department">{{ (doctor as any).department }}</p>
          <p class="title">{{ (doctor as any).title }}</p>
          <p class="description">{{ (doctor as any).description }}</p>
        </div>
        <button class="btn-chat">开始咨询</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== 页面容器 ===== */
.consultation-list-container {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--color-bg);
  padding-bottom: calc(var(--tab-bar-height) + 8px);
}

/* ===== 顶部导航栏 ===== */
.top-bar {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--color-card);
  border-bottom: 1px solid var(--color-divider);
  padding: var(--spacing-lg) var(--spacing-xl);
}
.top-bar h1 {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--color-text-primary);
}

/* ===== 医生卡片 ===== */
#doctor-list {
  padding: var(--spacing-md) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}
.doctor-card-detail {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  background: var(--color-card);
  border-radius: var(--radius-md);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  cursor: pointer;
  transition: box-shadow 0.2s;
}
.doctor-card-detail:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
.doctor-avatar-large {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  object-fit: cover;
  flex-shrink: 0;
}
.doctor-info {
  flex: 1;
  min-width: 0;
}
.doctor-info h2 {
  font-size: var(--font-size-h4);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.online-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  background: #52c41a;
  color: #fff;
  font-weight: 500;
}
.department {
  font-size: var(--font-size-caption);
  color: var(--color-primary);
  margin-bottom: 2px;
}
.title {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}
.description {
  font-size: 12px;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btn-chat {
  flex-shrink: 0;
  padding: 8px 16px;
  border-radius: var(--radius-button);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-caption);
  font-weight: 700;
  border: none;
  cursor: pointer;
  white-space: nowrap;
}
.btn-chat:active {
  transform: scale(0.96);
}

/* ===== 加载骨架屏 ===== */
.loading-state {
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}
.skeleton-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  background: var(--color-card);
  border-radius: var(--radius-md);
}
.skeleton-avatar {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background: var(--color-divider);
  animation: pulse 1.5s ease-in-out infinite;
}
.skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.skeleton-line {
  height: 14px;
  border-radius: var(--radius-sm);
  background: var(--color-divider);
  animation: pulse 1.5s ease-in-out infinite;
}
.skeleton-name { width: 40%; }
.skeleton-dept { width: 25%; }
.skeleton-desc { width: 60%; }
@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}

/* ===== 错误态 ===== */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl) var(--spacing-xl);
  text-align: center;
  color: var(--color-text-secondary);
}
.error-icon {
  font-size: 48px;
  color: var(--color-divider);
  margin-bottom: var(--spacing-lg);
}
.btn-retry {
  margin-top: var(--spacing-lg);
  padding: 10px 24px;
  border-radius: var(--radius-button);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-body);
  font-weight: 700;
  border: none;
  cursor: pointer;
}

/* ===== 空态 ===== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3xl) var(--spacing-xl);
  color: var(--color-text-secondary);
}
.empty-icon {
  font-size: 48px;
  color: var(--color-divider);
  margin-bottom: var(--spacing-lg);
}
</style>
