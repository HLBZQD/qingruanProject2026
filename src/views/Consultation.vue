<!-- src/views/Consultation.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getDoctors } from '@/composables/useHomeApi'
import AppIcon from '@/components/icons/AppIcon.vue'
import DiabetesIcon from '@/components/icons/DiabetesIcon.vue'
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
      <div class="top-bar-grid" aria-hidden="true"></div>
      <div class="top-bar-shapes" aria-hidden="true">
        <span class="top-shape top-shape-1"></span>
        <span class="top-shape top-shape-2"></span>
      </div>
      <div class="top-bar-inner">
        <div class="top-bar-title-wrap">
          <span class="top-bar-icon">
            <DiabetesIcon name="stethoscope" :size="22" color="#fff" />
          </span>
          <div>
            <h1>医师咨询</h1>
            <p class="top-bar-sub">专业医师，随时为您解答健康问题</p>
          </div>
        </div>
      </div>
      <div class="top-bar-wave" aria-hidden="true">
        <svg viewBox="0 0 400 28" preserveAspectRatio="none">
          <path d="M0,0 L0,12 Q100,28 200,16 T400,12 L400,0 Z" fill="var(--color-bg)" />
        </svg>
      </div>
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
      <DiabetesIcon name="medical-sign" :size="48" color="#CBD5E1" />
      <p>{{ error }}</p>
      <button @click="fetchDoctors" class="btn-retry">重试</button>
    </div>

    <!-- 空态 -->
    <div v-else-if="doctors.length === 0" class="empty-state">
      <DiabetesIcon name="doctor-bag" :size="48" color="#CBD5E1" />
      <p>暂无在线医生</p>
    </div>

    <!-- 医生列表 -->
    <div v-else id="doctor-list">
      <div
        v-for="(doctor, index) in doctors"
        :key="doctor.id"
        class="doctor-card-detail"
        :class="{ 'doctor-card-alt': index % 2 === 1 }"
        @click="goToChat(doctor.id)"
      >
        <span class="doctor-card-accent" aria-hidden="true"></span>
        <div class="avatar-column">
          <img
            class="doctor-avatar-large"
            :src="doctor.avatar || '/default-avatar.png'"
            :alt="doctor.name"
          />
          <span v-if="(doctor as any).is_online !== false" class="doctor-status">
            <span class="data-dot-static"></span>
            在线
          </span>
        </div>
        <div class="doctor-info">
          <h2>
            {{ doctor.name }}
            <span class="doctor-title-badge">{{ (doctor as any).title }}</span>
          </h2>
          <p class="department">{{ (doctor as any).department }}</p>
          <p class="description">{{ (doctor as any).description }}</p>
        </div>
        <button class="btn-chat">咨询</button>
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
  background: var(--color-primary);
  padding: 48px var(--spacing-lg) 0;
  overflow: hidden;
  box-shadow: var(--shadow-primary);
  margin-bottom: var(--spacing-lg);
}

.top-bar-grid {
  position: absolute;
  inset: 0;
  opacity: 0.08;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.5) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.5) 1px, transparent 1px);
  background-size: 28px 28px;
  pointer-events: none;
}

.top-bar-shapes {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.top-shape {
  position: absolute;
  border-radius: 24%;
}

.top-shape-1 {
  width: 100px;
  height: 100px;
  background: var(--color-vivid);
  opacity: 0.15;
  top: -30px;
  right: -20px;
  transform: rotate(15deg);
}

.top-shape-2 {
  width: 60px;
  height: 60px;
  background: var(--color-accent);
  opacity: 0.2;
  bottom: 50px;
  right: 15%;
  transform: rotate(-10deg);
}

.top-bar-inner {
  position: relative;
  z-index: 1;
  padding-bottom: 16px;
}

.top-bar-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.top-bar-icon {
  width: 44px;
  height: 44px;
  border-radius: 24%;
  background: rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  transform: rotate(3deg);
}

.top-bar h1 {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
}

.top-bar-sub {
  font-size: var(--font-size-caption);
  color: rgba(255, 255, 255, 0.75);
  margin-top: 2px;
  font-weight: 500;
}

.top-bar-wave {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 26px;
  transform: translateY(1px);
}

.top-bar-wave svg {
  width: 100%;
  height: 100%;
  display: block;
}

/* ===== 医生列表 ===== */
#doctor-list {
  padding: var(--spacing-md) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.doctor-card-detail {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  background: var(--color-card);
  border-radius: 20px 8px 20px 8px;
  border: 1.5px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  overflow: hidden;
}

.doctor-card-detail:nth-child(even) {
  border-radius: 8px 20px 8px 20px;
}

.doctor-card-detail:hover,
.doctor-card-detail:active {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.doctor-card-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  background: var(--color-primary);
}

.doctor-card-detail:nth-child(even) .doctor-card-accent {
  background: var(--color-accent);
}

.avatar-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.doctor-avatar-large {
  width: 58px;
  height: 58px;
  border-radius: 28%;
  object-fit: cover;
  border: 2px solid var(--color-primary-light);
  background: var(--color-bg);
}

.doctor-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--color-success);
  background: var(--color-success-light);
  padding: 2px 7px;
  border-radius: var(--radius-tag);
}

.doctor-info {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
}

.doctor-info h2 {
  font-size: var(--font-size-h4);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.doctor-title-badge {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: var(--radius-tag);
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 600;
}

.department {
  font-size: var(--font-size-caption);
  color: var(--color-accent-dark);
  font-weight: 700;
  margin-bottom: 4px;
}

.description {
  font-size: var(--font-size-caption);
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-chat {
  flex-shrink: 0;
  padding: 8px 18px;
  border-radius: 20px 6px 20px 6px;
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-caption);
  font-weight: 700;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--transition-fast), transform var(--transition-fast);
  box-shadow: var(--shadow-primary);
}

.doctor-card-detail:nth-child(even) .btn-chat {
  background: var(--color-accent);
  box-shadow: var(--shadow-glow);
}

.btn-chat:active {
  transform: scale(0.96);
  box-shadow: var(--shadow-md);
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
  border-radius: 20px 8px 20px 8px;
  border: 1.5px solid var(--color-border);
}

.skeleton-avatar {
  width: 58px;
  height: 58px;
  border-radius: 28%;
  background: var(--color-divider);
  animation: skeletonPulse 1.5s ease-in-out infinite;
  flex-shrink: 0;
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
  animation: skeletonPulse 1.5s ease-in-out infinite;
}

.skeleton-name { width: 40%; }
.skeleton-dept { width: 25%; }
.skeleton-desc { width: 60%; }

@keyframes skeletonPulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
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

.error-state .diabetes-icon {
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
  transition: background var(--transition-fast);
  box-shadow: var(--shadow-primary);
}

.btn-retry:active {
  background: var(--color-primary-dark);
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

.empty-state .diabetes-icon {
  margin-bottom: var(--spacing-lg);
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-avatar,
  .skeleton-line {
    animation: none;
  }
}
</style>
