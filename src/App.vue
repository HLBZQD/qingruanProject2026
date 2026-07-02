<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
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

/* ===== 路由与首屏加载动画 (Satisfying Page Loader) ===== */
const isAppLoading = ref(true)
const isRouteLoading = ref(false)

router.beforeEach((to, from, next) => {
  isRouteLoading.value = true
  next()
})

router.afterEach(() => {
  setTimeout(() => {
    isRouteLoading.value = false
  }, 400)
})

/* ===== 鼠标粒子及点击波纹系统 (Acid Mouse Emitters & Ripples) ===== */
const particleCanvas = ref<HTMLCanvasElement | null>(null)
let animationFrameId = 0
const particles: Array<{ x: number; y: number; vx: number; vy: number; alpha: number; color: string; size: number }> = []
const ripples: Array<{ x: number; y: number; radius: number; maxRadius: number; alpha: number; color: string; width: number }> = []
const colors = ['#FF3B30', '#78E0A0', '#78E0A0', '#FFCC00', '#FF8EAA']

function handleMouseMove(e: MouseEvent) {
  for (let i = 0; i < 2; i++) {
    particles.push({
      x: e.clientX,
      y: e.clientY,
      vx: (Math.random() - 0.5) * 1.6,
      vy: (Math.random() - 0.5) * 1.6,
      alpha: 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 3 + 2.5
    })
  }
}

function handleTouchMove(e: TouchEvent) {
  if (e.touches.length > 0) {
    const touch = e.touches[0]
    for (let i = 0; i < 2; i++) {
      particles.push({
        x: touch.clientX,
        y: touch.clientY,
        vx: (Math.random() - 0.5) * 1.6,
        vy: (Math.random() - 0.5) * 1.6,
        alpha: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 3 + 2.5
      })
    }
  }
}

function handleMouseDown(e: MouseEvent) {
  ripples.push({
    x: e.clientX,
    y: e.clientY,
    radius: 4,
    maxRadius: 56,
    alpha: 1,
    color: colors[Math.floor(Math.random() * colors.length)],
    width: 2.5
  })
}

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length > 0) {
    const touch = e.touches[0]
    ripples.push({
      x: touch.clientX,
      y: touch.clientY,
      radius: 4,
      maxRadius: 56,
      alpha: 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      width: 2.5
    })
  }
}

function updateParticles() {
  if (!particleCanvas.value) return
  const canvas = particleCanvas.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 1. 更新与绘制鼠标跟随微尘
  if (particles.length > 60) {
    particles.splice(0, particles.length - 60)
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x += p.vx
    p.y += p.vy
    p.alpha -= 0.024
    if (p.alpha <= 0) {
      particles.splice(i, 1)
      continue
    }

    ctx.save()
    ctx.globalAlpha = p.alpha
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // 2. 更新与绘制手绘波纹
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i]
    r.radius += (r.maxRadius - r.radius) * 0.12
    r.alpha -= 0.025
    if (r.alpha <= 0) {
      ripples.splice(i, 1)
      continue
    }

    ctx.save()
    ctx.globalAlpha = r.alpha
    ctx.strokeStyle = r.color
    ctx.lineWidth = r.width
    
    // 主环线
    ctx.beginPath()
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
    ctx.stroke()
    
    // 不对称同心双环线（体现手绘感与重影感）
    ctx.beginPath()
    ctx.arc(r.x + 2, r.y - 1, r.radius * 0.85, 0, Math.PI * 2)
    ctx.strokeStyle = r.color
    ctx.lineWidth = r.width * 0.5
    ctx.stroke()
    
    ctx.restore()
  }

  animationFrameId = requestAnimationFrame(updateParticles)
}

function resizeCanvas() {
  if (particleCanvas.value) {
    particleCanvas.value.width = window.innerWidth
    particleCanvas.value.height = window.innerHeight
  }
}

function triggerWaterSplash() {
  const centerX = window.innerWidth / 2
  const centerY = window.innerHeight / 3
  
  // 溅起 40 个水花微粒
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = Math.random() * 5 + 3
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      alpha: 1.0,
      color: '#5AC8FA',
      size: Math.random() * 4 + 3.5
    })
  }
  
  // 溅起 3 重水花同心圈
  for (let i = 0; i < 3; i++) {
    ripples.push({
      x: centerX,
      y: centerY,
      radius: 8,
      maxRadius: 100 + i * 40,
      alpha: 1.0,
      color: '#0071E3',
      width: 3.5
    })
  }
}

onMounted(() => {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('touchmove', handleTouchMove)
  window.addEventListener('mousedown', handleMouseDown)
  window.addEventListener('touchstart', handleTouchStart)
  window.addEventListener('avatar-splash', triggerWaterSplash)
  updateParticles()

  // 模拟首屏加载淡出
  setTimeout(() => {
    isAppLoading.value = false
  }, 750)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas)
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('touchmove', handleTouchMove)
  window.removeEventListener('mousedown', handleMouseDown)
  window.removeEventListener('touchstart', handleTouchStart)
  window.removeEventListener('avatar-splash', triggerWaterSplash)
  cancelAnimationFrame(animationFrameId)
})
</script>

<template>
  <div class="app-root" :class="{ 'chat-blur-active': chatStore.fabOpen }">
    <!-- 全局鼠标追踪粒子与点击波纹 Canvas -->
    <canvas ref="particleCanvas" class="particle-canvas" aria-hidden="true"></canvas>
    
    <!-- 全局酸性噪点纹理叠加层 -->
    <div class="noise-overlay" aria-hidden="true"></div>

    <!-- 有趣的酸性页面加载动画 -->
    <transition name="fade-loader">
      <div v-if="isAppLoading || isRouteLoading" class="acid-loader-overlay">
        <div class="loader-sketch-box">
          <div class="loader-aura"></div>
          <div class="loader-spinner-wrap">
            <div class="pixel-pill-spinner"></div>
          </div>
          <div class="loader-text-group">
            <div class="loader-title">系统正在智能载入</div>
            <div class="loader-sub">小糖正在为您配置健康控糖引擎 // 100%</div>
          </div>
          <div class="loader-progress-bar">
            <div class="loader-progress-fill"></div>
          </div>
        </div>
      </div>
    </transition>

    <router-view />

    <TabBar v-if="showTabBar" :tabs="tabs" />
    <FabButton v-if="showFab" :open="chatStore.fabOpen" @click="toggleFab" />
    <AiChatDialog />
  </div>
</template>

<style scoped>
/* AI助手打开时背景深度动态虚化与过渡 */
.app-root > * {
  transition: filter 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.app-root.chat-blur-active > *:not(canvas):not(.noise-overlay):not(.ai-chat-dialog) {
  filter: blur(8px) grayscale(0.2);
  pointer-events: none;
}

.app-root {
  min-height: 100vh;
  background: var(--color-bg);
  background-image: 
    linear-gradient(rgba(255, 59, 48, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 59, 48, 0.05) 1px, transparent 1px),
    repeating-linear-gradient(45deg, rgba(255, 149, 0, 0.024) 0px, rgba(255, 149, 0, 0.024) 1.5px, transparent 1.5px, transparent 16px);
  background-size: 24px 24px, 24px 24px, 16px 16px;
  background-position: center top;
}

.particle-canvas {
  position: fixed;
  inset: 0;
  z-index: 10000;
  pointer-events: none;
}

.noise-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.055;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
}

/* ===== 页面加载过渡样式 ===== */
.acid-loader-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-bg);
  z-index: 999999;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: all;
}

.loader-sketch-box {
  position: relative;
  background: var(--color-bg-elevated);
  border: 2px solid var(--color-text-primary);
  box-shadow: 5px 5px 0px var(--color-text-primary);
  border-radius: var(--radius-2xl);
  padding: 32px 48px;
  text-align: center;
  width: 320px;
  overflow: hidden;
  animation: loaderPulse 1.5s infinite ease-in-out;
}

.loader-aura {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, rgba(90, 200, 250, 0.15) 0%, transparent 80%);
  pointer-events: none;
}

.pixel-pill-spinner {
  width: 48px;
  height: 24px;
  border: 1.5px solid var(--color-text-primary);
  background: linear-gradient(90deg, #30B0C7, #78E0A0) !important;
  border-radius: 12px;
  margin: 0 auto 16px;
  animation: pillSpin 1s infinite cubic-bezier(0.68, -0.55, 0.27, 1.55);
}

.loader-text-group {
  margin-bottom: 16px;
}

.loader-title {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 800;
  color: var(--color-text-primary);
  letter-spacing: 0.05em;
}

.loader-sub {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-tertiary);
  margin-top: 4px;
}

.loader-progress-bar {
  width: 100%;
  height: 8px;
  background: var(--color-divider);
  border: 1.5px solid var(--color-text-primary);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.loader-progress-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #FF9500, #FFCC00) !important;
  animation: fillProgress 0.6s ease-out forwards;
}

/* 动效 Keyframes */
@keyframes pillSpin {
  0% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(180deg) scale(1.08); }
  100% { transform: rotate(360deg) scale(1); }
}

@keyframes loaderPulse {
  0%, 100% { transform: scale(1) rotate(-0.5deg); }
  50% { transform: scale(1.015) rotate(0.5deg); }
}

@keyframes fillProgress {
  0% { width: 0%; }
  100% { width: 100%; }
}

.fade-loader-leave-active {
  transition: opacity 0.35s cubic-bezier(0.25, 1, 0.5, 1);
}
.fade-loader-leave-to {
  opacity: 0;
}
</style>
