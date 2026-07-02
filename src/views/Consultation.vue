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
      <div class="ai-glow-overlay" aria-hidden="true"></div>
      <div class="ai-vector-bg" aria-hidden="true">
        <svg viewBox="0 0 200 100" preserveAspectRatio="none">
          <path d="M0,50 Q40,20 80,80 T160,30 T200,50" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2" />
          <path d="M0,60 Q30,80 70,30 T150,70 T200,40" fill="none" stroke="rgba(90,200,250,0.06)" stroke-width="1.5" />
        </svg>
      </div>

      <div class="top-bar-inner">
        <div class="top-bar-title-wrap">
          <span class="top-bar-icon">
            <DiabetesIcon name="stethoscope" :size="20" color="#30B0C7" />
          </span>
          <div>
            <div class="top-bar-header-meta">
              <span class="top-bar-badge">CLINIC CENTER</span>
              <span class="top-bar-status">在线</span>
            </div>
            <h1 class="top-bar-title">医师咨询</h1>
            <p class="top-bar-sub">专业医师，随时为您解答健康问题</p>
          </div>
        </div>
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
  background: transparent;
  padding-bottom: calc(var(--tab-bar-height) + 8px);
}

/* ===== 顶部导航栏 ===== */
.top-bar {
  position: relative;
  margin: 16px var(--spacing-lg) var(--spacing-lg);
  padding: 24px 20px;
  background: linear-gradient(135deg, #0c0c14 0%, #171825 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-2xl);
  box-shadow: 0 12px 30px -10px rgba(0, 113, 227, 0.25);
  color: #fff;
  overflow: hidden;
}

.top-bar-inner {
  position: relative;
  z-index: 10;
}

.top-bar-title-wrap {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.top-bar-icon {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-lg);
  background: rgba(90, 200, 250, 0.15);
  border: 1px solid rgba(90, 200, 250, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.top-bar-header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.top-bar-badge {
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.1em;
  background: rgba(90, 200, 250, 0.15);
  color: var(--color-accent);
  padding: 1px 5px;
  border-radius: var(--radius-full);
  border: 1px solid rgba(90, 200, 250, 0.2);
  text-transform: uppercase;
}

.top-bar-status {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
}

.top-bar-status::before {
  content: '';
  width: 5px;
  height: 5px;
  background: #78E0A0;
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 0 6px #78E0A0;
}

.top-bar-title {
  font-size: 19px;
  font-weight: 800;
  color: #ffffff !important;
  line-height: 1.2;
}

.top-bar-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65) !important;
  margin-top: 4px;
  font-weight: 400;
}

.ai-glow-overlay {
  position: absolute;
  width: 140px;
  height: 140px;
  background: radial-gradient(circle, rgba(90, 200, 250, 0.18) 0%, transparent 70%);
  right: -30px;
  top: -30px;
  filter: blur(20px);
  pointer-events: none;
  z-index: 1;
}

.ai-vector-bg {
  position: absolute;
  inset: 0;
  opacity: 0.85;
  pointer-events: none;
  z-index: 1;
}

.ai-vector-bg svg {
  width: 100%;
  height: 100%;
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
  border-radius: var(--radius-2xl);
  border: 1.5px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  overflow: hidden;
}

/* Alternating style overrides removed for geometric consistency */

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
  border-radius: 50%;
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
  border-radius: var(--radius-button);
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
  border-radius: var(--radius-2xl);
  border: 1.5px solid var(--color-border);
}

.skeleton-avatar {
  width: 58px;
  height: 58px;
  border-radius: 50%;
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
