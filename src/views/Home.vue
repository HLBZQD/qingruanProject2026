<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'
import { escapeHtml, sanitizeHtml } from '@/utils/sanitize'
import { useHomeStore } from '@/stores/homeStore'
import { useAuthStore } from '@/stores/authStore'
import { useLifePlanStore } from '@/stores/lifePlanStore'
import { usePunchStore } from '@/stores/punchStore'
import { useChatStore } from '@/stores/chatStore'
import type { DiabetesTypeView } from '@/stores/homeStore'
import type { Article, DiabetesType, DiabetesTypeDetail } from '@/types/api'
import AppIcon from '@/components/icons/AppIcon.vue'
import DiabetesIcon from '@/components/icons/DiabetesIcon.vue'

const router = useRouter()
const homeStore = useHomeStore()
const authStore = useAuthStore()
const lifePlanStore = useLifePlanStore()
const punchStore = usePunchStore()
const chatStore = useChatStore()

const FALLBACK_ARTICLE_COVER = 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=300&q=80'
const FALLBACK_DOCTOR_AVATAR = '/static/images/placeholder-doctor.svg'

const typeCovers = [
  'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=250&q=80', // Type 1: healthy diagnostics
  'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=250&q=80', // Type 2: organic diet
  'https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=250&q=80', // Gestational: maternity
  'https://images.unsplash.com/photo-1579684389782-64d84b5e901a?auto=format&fit=crop&w=250&q=80'  // Others: clinical stethoscope
]

function getTypeCover(t: DiabetesTypeView, index: number): string {
  return t.cover || typeCovers[index % typeCovers.length]
}

const doctors = computed(() => homeStore.doctors)
const articles = computed(() => homeStore.articles.slice(0, 3))
const diabetesTypes = computed<DiabetesTypeView[]>(() => homeStore.diabetesTypes)

const articleCover = (a: Article): string => a.cover || FALLBACK_ARTICLE_COVER
const articleViews = (a: Article): number => a.views
const articleSummary = (a: Article): string => a.summary

// 轮播 Banner 配置 (去除红绿冲突，采用蓝、青、金橘三色)
const banners = [
  { id: 1, title: '科学控糖', subtitle: '个性化方案，从今天开始', stat: '7×24', icon: 'pulse', color: '#0071E3', colorLight: '#5AC8FA' },
  { id: 2, title: 'AI 医师在线', subtitle: '专业咨询，触手可及', stat: 'AI', icon: 'doctor-bag', color: '#30B0C7', colorLight: '#E0FBFD' },
  { id: 3, title: '每日健康打卡', subtitle: '记录每一份坚持', stat: '365', icon: 'medical-note', color: '#FF9500', colorLight: '#FFF9F0' },
]
const current = ref(0)
let bannerTimer: ReturnType<typeof setInterval> | null = null

function nextBanner(): void {
  current.value = (current.value + 1) % banners.length
}
function startAuto(): void {
  stopAuto()
  bannerTimer = setInterval(nextBanner, 4000)
}
function stopAuto(): void {
  if (bannerTimer) {
    clearInterval(bannerTimer)
    bannerTimer = null
  }
}

// greeting greetingTime
const greetingTime = computed(() => {
  const hours = new Date().getHours()
  if (hours < 9) return '早上好'
  if (hours < 12) return '上午好'
  if (hours < 14) return '中午好'
  if (hours < 18) return '下午好'
  return '晚上好'
})

// latest recorded glucose level from check-ins (fallbacks to 5.6 if none)
const latestGlucose = computed(() => {
  const hasRecords = punchStore.records && punchStore.records.length > 0
  if (hasRecords) {
    for (const r of punchStore.records) {
      if (r.remarks) {
        const match = r.remarks.match(/(\d+(\.\d+)?)/)
        if (match) return match[1]
      }
    }
  }
  return '5.6'
})

const latestGlucoseTime = computed(() => {
  const hasRecords = punchStore.records && punchStore.records.length > 0
  if (hasRecords && punchStore.records[0].punch_time) {
    const d = new Date(punchStore.records[0].punch_time)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }
  return '08:30'
})

const glucoseStatus = computed(() => {
  const val = parseFloat(latestGlucose.value)
  if (isNaN(val)) return { text: '正常', isNormal: true }
  if (val >= 3.9 && val <= 7.0) {
    return { text: '正常', isNormal: true }
  } else {
    return { text: '异常', isNormal: false }
  }
})

function getCatSlug(cat: string): string {
  const mapping: Record<string, string> = {
    '全部': 'all',
    '饮食指导': 'diet',
    '运动指南': 'sports',
    '生活习惯': 'habits',
    '知识科普': 'science'
  }
  return mapping[cat] || 'all'
}

// dynamic punch plan progress checklist
const planProgressPercent = computed(() => {
  const plan = lifePlanStore.currentPlan
  if (!plan) return 0
  const diet = plan.diet_plans || []
  const exercise = plan.exercise_plans || []
  const other = plan.other_plans || []
  const total = diet.length + exercise.length + other.length
  if (total === 0) return 0

  let done = 0
  for (const item of [...diet, ...exercise, ...other]) {
    if (lifePlanStore.completedMap.get(item.id) === 'completed') {
      done++
    }
  }
  return Math.round((done / total) * 100)
})

const planProgressText = computed(() => {
  const plan = lifePlanStore.currentPlan
  if (!plan) return '0/0'
  const diet = plan.diet_plans || []
  const exercise = plan.exercise_plans || []
  const other = plan.other_plans || []
  const total = diet.length + exercise.length + other.length
  if (total === 0) return '0/0'

  let done = 0
  for (const item of [...diet, ...exercise, ...other]) {
    if (lifePlanStore.completedMap.get(item.id) === 'completed') {
      done++
    }
  }
  return `${done}/${total}`
})

const planProgressDesc = computed(() => {
  const plan = lifePlanStore.currentPlan
  if (!plan) return '尚未制定专属控糖计划'
  const diet = plan.diet_plans || []
  const exercise = plan.exercise_plans || []
  const other = plan.other_plans || []
  const total = diet.length + exercise.length + other.length
  if (total === 0) return '尚未制定专属控糖计划'
  const pct = planProgressPercent.value
  if (pct === 100) return '今日任务已圆满完成！'
  return '科学记录，控糖每一天'
})

function typeStyle(id: number): { bg: string; accent: string } {
  const m = id % 4
  if (m === 1) return { bg: '#F5F9FF', accent: '#0071E3' } // Blue
  if (m === 2) return { bg: '#F4F2FF', accent: '#5856D6' } // Indigo/Purple
  if (m === 3) return { bg: '#F0FBFD', accent: '#30B0C7' } // Teal
  return { bg: '#FFF9F0', accent: '#FF9500' } // Orange/Gold
}

const doctorsLoading = computed(() => homeStore.loading && doctors.value.length === 0 && !homeStore.doctorsError)
const articlesLoading = computed(() => homeStore.loading && articles.value.length === 0 && !homeStore.articlesError)
const typesLoading = computed(() => homeStore.loading && diabetesTypes.value.length === 0 && !homeStore.typesError)

function goDoctor(doc?: { id: number }): void {
  if (doc?.id) {
    router.push('/consultation/doctor/' + doc.id)
  } else {
    router.push('/consultation')
  }
}
function goArticle(id: number): void {
  if (!id) return
  router.push({ path: '/news/article/' + id })
}
function goNewsList(): void {
  router.push('/news')
}
function onSearch(): void {
  void Swal.fire<string>({
    title: '搜索健康资讯',
    input: 'text',
    inputPlaceholder: '输入文章标题或标签关键词',
    showCancelButton: true,
    confirmButtonText: '搜索',
    cancelButtonText: '取消',
    confirmButtonColor: '#0071E3',
    inputValidator: (value) => {
      if (!value || !value.trim()) return '请输入搜索关键词'
      return null
    },
    preConfirm: (keyword) => {
      const trimmed = keyword.trim()
      router.push('/news?keyword=' + encodeURIComponent(trimmed))
    },
  })
}

async function onGlucoseCardClick(): Promise<void> {
  if (!authStore.token) {
    void Swal.fire({
      title: '提示',
      text: '请先登录后再记录血糖数据',
      icon: 'warning',
      confirmButtonText: '去登录',
      confirmButtonColor: '#0071E3',
    }).then(() => {
      router.push('/login')
    })
    return
  }

  const plan = lifePlanStore.currentPlan
  const firstItem = plan?.diet_plans?.[0] || plan?.exercise_plans?.[0]
  if (!firstItem) {
    void Swal.fire({
      title: '未生成控糖方案',
      text: '检测到您尚未制定个人健康方案，请先在「生活方案」页面生成您的控糖计划再进行记录！',
      icon: 'info',
      confirmButtonText: '去制定方案',
      confirmButtonColor: '#0071E3',
    }).then(() => {
      router.push('/life-plan')
    })
    return
  }

  const { value: val } = await Swal.fire({
    title: '记录今日血糖',
    input: 'text',
    inputLabel: '当前血糖值 (mmol/L)',
    inputPlaceholder: '请输入当前血糖数值，例如: 5.6',
    showCancelButton: true,
    confirmButtonText: '提交',
    cancelButtonText: '取消',
    confirmButtonColor: '#0071E3',
    inputValidator: (value) => {
      if (!value) return '请输入数值'
      const num = parseFloat(value)
      if (isNaN(num) || num <= 0 || num > 30) {
        return '请输入合法的血糖数值 (0 - 30)'
      }
      return null
    },
  })

  if (val) {
    const inputValue = parseFloat(val).toFixed(1)
    try {
      await lifePlanStore.createPunch(
        {
          plan_id: firstItem.id,
          punch_type: firstItem.plan_type === 'exercise' ? 'exercise' : 'diet',
          completion_status: 'completed',
          remarks: `测量血糖: ${inputValue} mmol/L`,
        },
        firstItem.id,
      )
      await punchStore.fetchList()
      void Swal.fire({
        toast: true,
        position: 'top',
        timer: 1500,
        showConfirmButton: false,
        icon: 'success',
        title: '血糖数据记录成功！',
      })
    } catch {
      void Swal.fire({
        toast: true,
        position: 'top',
        timer: 2000,
        showConfirmButton: false,
        icon: 'error',
        title: '记录失败，请重试',
      })
    }
  }
}

async function showDiabetesType(t: DiabetesType): Promise<void> {
  try {
    const detail = await homeStore.fetchDiabetesTypeDetail(t.id)
    const data: DiabetesTypeDetail = detail ?? t
    openTypeSwal(data)
  } catch {
    openTypeSwal(t)
  }
}

function openTypeSwal(t: DiabetesTypeDetail): void {
  const buildSection = (label: string, body?: string): string =>
    body
      ? `<h4 style="color:var(--color-primary);font-size:15px;margin:14px 0 6px;text-align:left;font-weight:700">${label}</h4>` +
        `<p style="font-size:13px;line-height:1.7;color:#48484A;margin:0;text-align:left">${escapeHtml(body)}</p>`
      : ''
  const html = sanitizeHtml(
    `<div class="dt-modal">
       ${buildSection('病因', t.pathogenesis)}
       ${buildSection('临床表现', t.manifestation)}
       ${buildSection('治疗方式', t.treatment)}
     </div>`,
  )
  void Swal.fire({
    title: t.name || '糖尿病类型',
    html,
    confirmButtonText: '了解了',
    confirmButtonColor: '#0071E3',
    width: 340,
  })
}

function triggerAiDialog() {
  if (!chatStore.fabOpen) {
    chatStore.toggleFab()
  }
}

function hideImg(e: Event): void {
  ;(e.target as HTMLImageElement).style.display = 'none'
}
function retryDoctors(): void {
  void homeStore.retryDoctors()
}
function retryArticles(): void {
  void homeStore.retryArticles()
}
function retryTypes(): void {
  void homeStore.retryTypes()
}

onMounted(() => {
  startAuto()
  void homeStore.fetchHomeData()
  if (authStore.token) {
    void lifePlanStore.fetchCurrent()
    void punchStore.fetchList()
  }
})
onUnmounted(() => {
  stopAuto()
})
</script>

<template>
  <div class="home-page page-enter">
    <!-- Ambient Aurora background decoration (Apple Siri Inspired - No Red/Green) -->
    <div class="aurora-glow aurora-glow-1" aria-hidden="true"></div>
    <div class="aurora-glow aurora-glow-2" aria-hidden="true"></div>
    <div class="aurora-glow aurora-glow-3" aria-hidden="true"></div>

    <!-- A. 顶部 Header (System Brand Icon & App Title) -->
    <header class="home-header">
      <div class="home-header-inner">
        <div class="home-header-left">
          <div class="home-logo-wrap">
            <DiabetesIcon name="diabetes" :size="22" color="#fff" />
          </div>
          <div class="greeting-wrap">
            <h1 class="home-title-text neon-text-teal">糖尿病预治智能助手</h1>
            <p class="home-subtitle-text">科学控糖 · 智慧生活</p>
          </div>
        </div>
        <button class="home-search-btn" aria-label="搜索" @click="onSearch">
          <AppIcon name="search" :size="16" />
        </button>
      </div>
    </header>

    <!-- B. 轮播 Banner -->
    <div class="home-banner-wrap">
      <div class="banner-frame" @click="nextBanner">
        <div
          v-for="(b, i) in banners"
          :key="b.id"
          v-show="current === i"
          class="banner-slide"
          :style="{ '--banner-accent': b.color, '--banner-accent-light': b.colorLight }"
        >
          <div class="banner-shapes" aria-hidden="true">
            <span class="banner-shape banner-shape-1"></span>
            <span class="banner-shape banner-shape-2"></span>
            <span class="banner-shape banner-shape-3"></span>
          </div>
          <div class="banner-text">
            <div class="banner-eyebrow">
              <span class="data-dot-static"></span>
              <span>智能健康监测</span>
            </div>
            <h3 class="banner-title-text">{{ b.title }}</h3>
            <p class="banner-desc">{{ b.subtitle }}</p>
          </div>
          <div class="banner-right">
            <!-- Restored Banner Icon -->
            <div class="banner-icon-wrap">
              <DiabetesIcon :name="b.icon" :size="20" :color="b.color" />
            </div>
            <span class="banner-stat font-mono">{{ b.stat }}</span>
            <span class="banner-stat-label">HEALTH STATS</span>
          </div>
        </div>
        <div class="banner-dots">
          <span
            v-for="(b, i) in banners"
            :key="`dot-${b.id}`"
            class="banner-dot"
            :class="{ active: current === i }"
          ></span>
        </div>
      </div>
    </div>

    <!-- C. Bento Grid Section (今日健康追踪) -->
    <section class="home-section bento-section">
      <div class="section-title-wrap">
        <span class="section-badge">HEALTH DASHBOARD</span>
        <h2 class="dashboard-title">今日健康空间</h2>
      </div>

      <div class="bento-grid">
        <!-- 血糖数值卡片 (主卡片) -->
        <div class="bento-card glucose-card" @click="onGlucoseCardClick">
          <div class="card-bg-light"></div>
          <div class="card-header">
            <span class="card-title">最近血糖</span>
            <span :class="['card-indicator', glucoseStatus.isNormal ? 'normal' : 'abnormal']">
              {{ glucoseStatus.text }}
            </span>
          </div>
          <div class="glucose-val">
            <span class="val-num font-mono neon-text-teal">{{ latestGlucose }}</span>
            <span class="val-unit">mmol/L</span>
          </div>
          <!-- Miniature blood sugar SVG trend line (Apple Stock-style) -->
          <svg class="glucose-mini-chart" viewBox="0 0 100 30" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.18" />
                <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path d="M 0,25 Q 20,15 40,22 T 80,10 T 100,18 L 100,30 L 0,30 Z" fill="url(#chartGrad)" />
            <path d="M 0,25 Q 20,15 40,22 T 80,10 T 100,18" fill="none" stroke="var(--color-primary)" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <div class="card-footer">
            <span class="footer-time">{{ latestGlucoseTime }} 记录</span>
            <span class="footer-btn">
              <AppIcon name="arrow-right" :size="10" />
            </span>
          </div>
        </div>

        <!-- 计划进度卡片 (次卡片) -->
        <div class="bento-card progress-card" @click="() => router.push('/life-plan')">
          <div class="card-bg-light"></div>
          <div class="card-header">
            <span class="card-title">今日打卡</span>
          </div>
          <div class="progress-val">
            <span class="val-num font-mono">{{ planProgressText }}</span>
          </div>
          <!-- Circular target ring silhouette -->
          <svg class="progress-mini-ring" viewBox="0 0 36 36">
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="var(--color-divider)"
              stroke-width="3"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="var(--color-primary)"
              stroke-width="3"
              stroke-linecap="round"
              :stroke-dasharray="`${planProgressPercent}, 100`"
            />
          </svg>
          <div class="bento-progress-track">
            <div class="bento-progress-bar" :style="{ width: planProgressPercent + '%' }"></div>
          </div>
          <span class="progress-desc">{{ planProgressDesc }}</span>
        </div>

        <!-- AI 糖小护入口 (长条卡片) -->
        <div class="bento-card ai-prompt-card" @click="triggerAiDialog">
          <div class="ai-glow-overlay"></div>
          <div class="ai-vector-bg">
            <svg viewBox="0 0 200 100" preserveAspectRatio="none">
              <path d="M0,50 Q40,20 80,80 T160,30 T200,50" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2" />
              <path d="M0,60 Q30,80 70,30 T150,70 T200,40" fill="none" stroke="rgba(90,200,250,0.06)" stroke-width="1.5" />
            </svg>
          </div>
          <div class="ai-content">
            <div class="ai-header">
              <span class="ai-badge">AI COPILOT</span>
              <span class="ai-status">在线</span>
            </div>
            <h3 class="ai-title">糖小护 · AI 智能诊疗助手</h3>
            <p class="ai-desc">输入您的饮食、健康指标或疑问，AI 医生即刻提供科学建议</p>
            <div class="mock-input-bar">
              <span class="mock-placeholder">“分析适合糖尿病的无糖晚餐食谱...”</span>
              <span class="mock-send-btn">
                <AppIcon name="arrow-right" :size="12" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- D. 专业医师团队 (Apple horizontal slider) -->
    <section class="home-section stagger-item">
      <div class="section-head">
        <div class="section-title-wrap">
          <h2 class="section-title">专业医师团队</h2>
        </div>
        <button class="section-link" @click="() => goDoctor()">
          查看全部 <AppIcon name="arrow-right" :size="10" />
        </button>
      </div>

      <div v-if="homeStore.doctorsError" class="block-empty">
        <p class="block-empty-text">医师列表加载失败</p>
        <button class="retry-btn" @click="retryDoctors">点击重试</button>
      </div>
      <div v-else-if="doctorsLoading" class="doctor-scroll">
        <div v-for="n in 3" :key="`ds-${n}`" class="doctor-skeleton"></div>
      </div>
      <div v-else-if="doctors.length === 0" class="block-empty">
        <p class="block-empty-text">暂无可咨询医师</p>
        <button class="retry-btn" @click="retryDoctors">点击重试</button>
      </div>
      <div v-else class="doctor-scroll">
        <div v-for="doc in doctors" :key="doc.id" class="doctor-card" @click="goDoctor(doc)">
          <div class="doctor-card-bg" aria-hidden="true"></div>
          <div class="doctor-avatar-wrap">
            <div class="avatar-ring">
              <img
                class="doctor-avatar"
                :src="doc.avatar || FALLBACK_DOCTOR_AVATAR"
                :alt="doc.name"
                @error="hideImg"
              />
            </div>
            <span class="online-dot" aria-hidden="true"></span>
          </div>
          <p class="doctor-name">{{ doc.name }}</p>
          <p class="doctor-dept">{{ doc.department }}</p>
          <span class="doctor-title">{{ doc.title }}</span>
        </div>
      </div>
    </section>

    <!-- E. 糖尿病类型科普 (Apple content bento with rich images) -->
    <section class="home-section stagger-item">
      <div class="section-head">
        <div class="section-title-wrap">
          <h2 class="section-title">糖尿病类型指南</h2>
        </div>
        <span class="section-link-static">
          科普 <AppIcon name="arrow-right" :size="10" />
        </span>
      </div>

      <div v-if="homeStore.typesError" class="block-empty">
        <p class="block-empty-text">糖尿病类型加载失败</p>
        <button class="retry-btn" @click="retryTypes">点击重试</button>
      </div>
      <div v-else-if="typesLoading" class="type-grid">
        <div v-for="n in 4" :key="`ts-${n}`" class="type-skeleton"></div>
      </div>
      <div v-else-if="diabetesTypes.length === 0" class="block-empty">
        <p class="block-empty-text">暂无糖尿病类型科普</p>
        <button class="retry-btn" @click="retryTypes">点击重试</button>
      </div>
      <div v-else class="type-grid">
        <article
          v-for="(t, index) in diabetesTypes"
          :key="t.id"
          class="type-card"
          :style="{ '--type-accent': typeStyle(t.id).accent }"
          @click="showDiabetesType(t)"
        >
          <div class="type-card-cover-wrap">
            <img class="type-card-cover" :src="getTypeCover(t, index)" :alt="t.name" />
            <div class="type-card-cover-overlay"></div>
          </div>
          <div class="type-card-content">
            <h3 class="type-name">{{ t.name }}</h3>
            <p class="type-brief">{{ t.brief }}</p>
            <div class="type-card-more">
              <span>阅读详情</span>
              <AppIcon name="arrow-right" :size="10" />
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- F. 健康科普 (Magazine Staggered Grid) -->
    <section class="home-section stagger-item">
      <div class="section-head">
        <div class="section-title-wrap">
          <h2 class="section-title">健康科普</h2>
        </div>
        <button class="section-link" @click="goNewsList">
          更多 <AppIcon name="arrow-right" :size="10" />
        </button>
      </div>

      <div v-if="homeStore.articlesError" class="block-empty">
        <p class="block-empty-text">科普文章加载失败</p>
        <button class="retry-btn" @click="retryArticles">点击重试</button>
      </div>
      <div v-else-if="articlesLoading" class="article-list">
        <div v-for="n in 3" :key="`as-${n}`" class="article-skeleton"></div>
      </div>
      <div v-else-if="articles.length === 0" class="block-empty">
        <p class="block-empty-text">暂无科普文章</p>
        <button class="retry-btn" @click="retryArticles">点击重试</button>
      </div>
      <div v-else class="article-grid">
        <!-- 1. Hero Card (Featured first article) -->
        <article v-if="articles[0]" class="article-hero-card" @click="goArticle(articles[0].id)">
          <div class="hero-cover-wrap">
            <img class="hero-cover" :src="articleCover(articles[0])" :alt="articles[0].title" @error="hideImg" />
            <div class="hero-cover-overlay"></div>
            <span :class="['hero-category', `tag-cat-${getCatSlug(articles[0].category)}`]">{{ articles[0].category }}</span>
          </div>
          <div class="hero-body">
            <h3 class="hero-title">{{ articles[0].title }}</h3>
            <p v-if="articleSummary(articles[0])" class="hero-summary">{{ articleSummary(articles[0]) }}</p>
            <div class="hero-meta">
              <span><AppIcon name="eye" :size="12" />{{ articleViews(articles[0]) }} 阅读</span>
              <span class="read-more">阅读全文 <AppIcon name="arrow-right" :size="10" /></span>
            </div>
          </div>
        </article>

        <!-- 2. Staggered Sub cards row -->
        <div class="article-sub-row">
          <article v-for="a in articles.slice(1)" :key="a.id" class="article-sub-card" @click="goArticle(a.id)">
            <div class="sub-cover-wrap">
              <img class="sub-cover" :src="articleCover(a)" :alt="a.title" @error="hideImg" />
              <div class="sub-cover-overlay"></div>
            </div>
            <div class="sub-body">
              <span :class="['sub-category', `tag-cat-${getCatSlug(a.category)}`]">{{ a.category }}</span>
              <h3 class="sub-title">{{ a.title }}</h3>
              <div class="sub-meta">
                <span><AppIcon name="eye" :size="10" />{{ articleViews(a) }}</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ============ 移动端容器 ============ */
.home-page {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  padding-bottom: calc(var(--tab-bar-height) + 16px);
  background: var(--color-bg);
  position: relative;
  overflow-x: hidden;
}

/* ============ A. Header ============ */
.home-header {
  position: sticky;
  top: 0;
  z-index: 30;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 20px var(--spacing-lg) 12px;
  border-bottom: 0.5px solid var(--color-divider);
}

.home-header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.home-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.home-logo-wrap {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 113, 227, 0.2);
  flex-shrink: 0;
}

.greeting-wrap {
  display: flex;
  flex-direction: column;
}

.home-title-text {
  font-size: 15px;
  font-weight: 800;
  color: var(--color-text-primary);
  line-height: 1.3;
}

.home-subtitle-text {
  font-size: 10px;
  color: var(--color-text-tertiary);
  font-weight: 700;
  line-height: 1.2;
}

.home-search-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--color-primary-light);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.home-search-btn:active {
  transform: scale(0.92);
}

/* ============ B. 轮播 Banner ============ */
.home-banner-wrap {
  padding: 0 var(--spacing-lg);
  margin-top: 16px;
}

.banner-frame {
  position: relative;
  height: 110px;
  background: linear-gradient(135deg, #171825 0%, #0c0c14 100%);
  border-radius: var(--radius-2xl); /* 8px */
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}

.banner-slide {
  position: absolute;
  inset: 0;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 2;
}

.banner-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.banner-eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  font-weight: 800;
  color: var(--banner-accent-light, var(--color-accent));
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.data-dot-static {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--banner-accent, var(--color-primary));
  box-shadow: 0 0 6px var(--banner-accent);
}

.banner-title-text {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
  margin-top: 4px;
  letter-spacing: -0.01em;
}

.banner-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 2px;
}

.banner-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.banner-icon-wrap {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
}

.banner-stat {
  font-size: 26px;
  font-weight: 800;
  color: var(--banner-accent-light);
  line-height: 1;
}

.banner-stat-label {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 700;
  margin-top: 4px;
}

.banner-dots {
  position: absolute;
  bottom: 8px;
  left: 20px;
  display: flex;
  gap: 6px;
  z-index: 10;
}

.banner-dot {
  width: 12px;
  height: 3px;
  border-radius: 1.5px;
  background: rgba(255, 255, 255, 0.2);
  transition: background-color 0.3s ease, width 0.3s ease;
}

.banner-dot.active {
  width: 20px;
  background: #fff;
}

/* ============ C. Bento Grid Section ============ */
.bento-section {
  padding: 0 var(--spacing-lg);
  margin-top: 24px;
}

.section-badge {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-primary);
  background: var(--color-primary-light);
  padding: 3px 8px;
  border-radius: var(--radius-full);
  display: inline-block;
  margin-bottom: var(--spacing-xs);
}

.dashboard-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--color-text-primary);
  letter-spacing: -0.02em;
}

.bento-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  margin-top: 14px;
}

.bento-card {
  position: relative;
  background: var(--color-card);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-2xl);
  padding: 16px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease, border-color 0.3s ease;
}

.bento-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 20px -8px rgba(0, 113, 227, 0.08);
  border-color: var(--color-primary-soft);
}

.bento-card:active {
  transform: scale(0.98);
}

.card-bg-light {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 10% 10%, var(--color-primary-light), transparent 60%);
  opacity: 0.5;
  pointer-events: none;
}

.glucose-card {
  grid-column: span 1;
  height: 148px;
}

.progress-card {
  grid-column: span 1;
  height: 148px;
}

.ai-prompt-card {
  grid-column: span 2;
  min-height: 172px;
  background: linear-gradient(135deg, #0c0c14 0%, #171825 100%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 12px 30px -10px rgba(0, 113, 227, 0.2);
  color: #fff;
}

.ai-prompt-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 36px -12px rgba(0, 113, 227, 0.3);
  border-color: rgba(90, 200, 250, 0.25);
}

.ai-glow-overlay {
  position: absolute;
  width: 140px;
  height: 140px;
  background: radial-gradient(circle, rgba(90, 200, 250, 0.2) 0%, transparent 70%);
  right: -30px;
  top: -30px;
  filter: blur(20px);
  pointer-events: none;
}

/* Card Header */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.card-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.card-indicator {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.card-indicator.normal {
  background: var(--color-success-light) !important;
  color: var(--color-success) !important;
  border: 1px solid var(--color-success) !important;
}

.card-indicator.abnormal {
  background: var(--color-danger-light) !important;
  color: var(--color-danger) !important;
  border: 1px solid var(--color-danger) !important;
}

/* Glucose Values */
.glucose-val {
  display: flex;
  align-items: baseline;
  gap: 2px;
  margin: 10px 0;
}

.glucose-val .val-num {
  font-size: 34px;
  font-weight: 800;
  color: var(--color-text-primary);
  line-height: 1;
  letter-spacing: -0.02em;
}

.glucose-val .val-unit {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: var(--color-text-tertiary);
  margin-top: auto;
  width: 100%;
}

.footer-btn {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
  background: var(--color-bg);
  border: 1px solid var(--color-divider);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
}

/* Progress Card */
.progress-val {
  margin: 10px 0 4px;
}

.progress-val .val-num {
  font-size: 28px;
  font-weight: 800;
  color: var(--color-text-primary);
}

.bento-progress-track {
  width: 100%;
  height: 5px;
  background: var(--color-divider);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin: 4px 0 8px;
}

.bento-progress-bar {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-full);
  transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.progress-desc {
  font-size: 10px;
  color: var(--color-text-tertiary);
  font-weight: 600;
}

/* AI Prompt Card */
.ai-content {
  position: relative;
  z-index: 10;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.ai-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ai-badge {
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.1em;
  background: rgba(90, 200, 250, 0.15);
  color: var(--color-accent);
  padding: 2px 6px;
  border-radius: var(--radius-full);
  border: 1px solid rgba(90, 200, 250, 0.2);
}

.ai-status {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ai-status::before {
  content: '';
  width: 5px;
  height: 5px;
  background: #30B0C7;
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 0 6px #30B0C7;
}

.ai-title {
  font-size: 17px;
  font-weight: 800;
  margin-top: 10px;
  color: #fff;
  letter-spacing: -0.01em;
}

.ai-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65);
  margin-top: 2px;
  margin-bottom: 12px;
  font-weight: 400;
}

.mock-input-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px 12px;
  margin-top: auto;
}

.mock-placeholder {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.mock-send-btn {
  width: 22px;
  height: 22px;
  border-radius: var(--radius-full);
  background: #fff;
  color: #0c0d19;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 8px;
}

/* ============ D. 专业医师团队 ============ */
.home-section {
  padding: 0 var(--spacing-lg);
  margin-top: 28px;
  position: relative;
  z-index: 2;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
}

.section-title {
  font-size: 17px;
  font-weight: 800;
  color: var(--color-text-primary);
  letter-spacing: -0.02em;
}

.section-link {
  font-size: var(--font-size-caption);
  color: var(--color-primary);
  background: none;
  border: none;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.section-link-static {
  font-size: var(--font-size-caption);
  color: var(--color-text-disabled);
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.doctor-scroll {
  display: flex;
  gap: var(--spacing-md);
  overflow-x: auto;
  padding-bottom: var(--spacing-sm);
  margin: 0 calc(-1 * var(--spacing-lg));
  padding-left: var(--spacing-lg);
  padding-right: var(--spacing-lg);
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.doctor-scroll::-webkit-scrollbar {
  display: none;
}

.doctor-card {
  position: relative;
  background: var(--color-card);
  border-radius: var(--radius-2xl);
  padding: var(--spacing-md);
  min-width: 140px;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease, border-color 0.3s ease;
  overflow: hidden;
}

.doctor-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  background: var(--color-primary-light);
  border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
}

.doctor-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 20px -8px rgba(0, 113, 227, 0.08);
  border-color: var(--color-primary-soft);
}

.doctor-card:active {
  transform: translateY(-2px) scale(0.97);
  box-shadow: var(--shadow-md);
}

.doctor-avatar-wrap {
  position: relative;
  width: 64px;
  height: 64px;
  margin: 0 auto var(--spacing-sm);
  z-index: 1;
}

.avatar-ring {
  width: 100%;
  height: 100%;
  border-radius: 30%;
  padding: 2px;
  background: var(--color-primary);
  box-shadow: 0 2px 8px rgba(0, 113, 227, 0.15);
}

.avatar-ring > .doctor-avatar {
  width: 100%;
  height: 100%;
  border: 2px solid #fff;
  border-radius: 28%;
  object-fit: cover;
  background: var(--color-bg);
}

.online-dot {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  background: var(--color-success);
  border: 2px solid #fff;
}

.doctor-name {
  text-align: center;
  font-weight: 800;
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
}

.doctor-dept {
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.doctor-title {
  display: block;
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  background: var(--color-primary-light);
  padding: 3px var(--spacing-sm);
  border-radius: var(--radius-tag);
  margin-top: 6px;
  font-weight: 700;
}

/* ============ E. 糖尿病类型 ============ */
.type-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.type-card {
  position: relative;
  background: var(--color-card);
  border-radius: var(--radius-2xl);
  overflow: hidden;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease, border-color 0.3s ease;
  min-height: 172px;
  display: flex;
  flex-direction: column;
}

.type-card:hover {
  transform: translateY(-5px);
  border-color: var(--type-accent, var(--color-primary-soft));
  box-shadow: 0 10px 20px -8px rgba(0, 113, 227, 0.08);
}

.type-card:active {
  transform: translateY(-2px) scale(0.97);
  box-shadow: var(--shadow-md);
}

.type-card-cover-wrap {
  height: 80px;
  width: 100%;
  position: relative;
  overflow: hidden;
  background: var(--color-divider);
}

.type-card-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.type-card:hover .type-card-cover {
  transform: scale(1.05);
}

.type-card-cover-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.04);
}

.type-card-content {
  padding: 12px;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  justify-content: space-between;
}

.type-name {
  font-size: 14px;
  font-weight: 800;
  color: var(--color-text-primary);
  margin-bottom: 2px;
}

.type-brief {
  font-size: 11px;
  color: var(--color-text-tertiary);
  line-height: 1.4;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-weight: 500;
}

.type-card-more {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--type-accent, var(--color-primary));
  margin-top: auto;
}

/* ============ F. 科普文章杂志风格网格 ============ */
.article-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Hero 大卡片 */
.article-hero-card {
  position: relative;
  background: var(--color-card);
  border-radius: var(--radius-2xl);
  overflow: hidden;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease, border-color 0.3s ease;
  display: flex;
  flex-direction: column;
}

.article-hero-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 24px -8px rgba(0, 113, 227, 0.08);
  border-color: var(--color-primary-soft);
}

.article-hero-card:active {
  transform: scale(0.98);
}

.hero-cover-wrap {
  position: relative;
  height: 160px;
  width: 100%;
  overflow: hidden;
  background: var(--color-divider);
}

.hero-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.article-hero-card:hover .hero-cover {
  transform: scale(1.04);
}

.hero-cover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.4), transparent);
}

.hero-category {
  position: absolute;
  top: 14px;
  left: 14px;
  font-size: 9px;
  font-weight: 800;
  color: #fff;
  background: var(--color-primary);
  padding: 3px 8px;
  border-radius: var(--radius-full);
  letter-spacing: 0.05em;
  box-shadow: 0 4px 10px rgba(0, 113, 227, 0.25);
}

.hero-body {
  padding: 16px;
}

.hero-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--color-text-primary);
  line-height: 1.4;
  letter-spacing: -0.01em;
}

.hero-summary {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: 6px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-weight: 500;
}

.hero-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  font-size: 11px;
  color: var(--color-text-disabled);
  font-weight: 600;
}

.hero-meta span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.hero-meta .read-more {
  color: var(--color-primary);
  font-weight: 700;
}

/* 并排小卡片行 */
.article-sub-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.article-sub-card {
  background: var(--color-card);
  border-radius: var(--radius-2xl);
  overflow: hidden;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease, border-color 0.3s ease;
  display: flex;
  flex-direction: column;
}

.article-sub-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px -6px rgba(0, 113, 227, 0.08);
  border-color: var(--color-primary-soft);
}

.article-sub-card:active {
  transform: scale(0.97);
}

.sub-cover-wrap {
  position: relative;
  height: 96px;
  width: 100%;
  overflow: hidden;
  background: var(--color-divider);
}

.sub-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.article-sub-card:hover .sub-cover {
  transform: scale(1.05);
}

.sub-cover-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.02);
}

.sub-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.sub-category {
  font-size: 8px;
  font-weight: 800;
  color: var(--color-primary);
  margin-bottom: 4px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sub-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--color-text-primary);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 8px;
}

.sub-meta {
  font-size: 10px;
  color: var(--color-text-disabled);
  font-weight: 600;
  margin-top: auto;
  display: flex;
  align-items: center;
}

.sub-meta span {
  display: flex;
  align-items: center;
  gap: 3px;
}

/* ============ 空状态 ============ */
.block-empty {
  background: var(--color-card);
  border: 1px dashed var(--color-divider);
  border-radius: var(--radius-2xl);
  padding: 32px var(--spacing-lg);
  text-align: center;
  margin: var(--spacing-md) 0;
}

.block-empty-text {
  font-size: var(--font-size-caption);
  color: var(--color-text-tertiary);
  font-weight: 500;
}

.retry-btn {
  background: var(--color-primary-light);
  color: var(--color-primary);
  border: none;
  border-radius: var(--radius-button);
  padding: var(--spacing-sm) var(--spacing-lg);
  font-size: var(--font-size-caption);
  font-weight: 700;
  margin-top: var(--spacing-md);
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.retry-btn:active {
  transform: scale(0.95);
}

/* ============ 骨架屏 ============ */
.doctor-skeleton,
.article-skeleton,
.type-skeleton {
  background: var(--color-divider);
  border-radius: var(--radius-md);
  animation: skeletonPulse 1.4s ease-in-out infinite;
}

@keyframes skeletonPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.doctor-skeleton {
  min-width: 140px;
  height: 180px;
  flex-shrink: 0;
  border-radius: var(--radius-3xl);
}

.article-skeleton {
  height: 104px;
  border-radius: var(--radius-xl);
}

.type-skeleton {
  height: 172px;
  border-radius: var(--radius-2xl);
}

/* Aurora Background lights (Apple Siri Inspired) */
.aurora-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  pointer-events: none;
  z-index: 0;
  opacity: 0.65;
}

.aurora-glow-1 {
  width: 260px;
  height: 260px;
  background: radial-gradient(circle, rgba(0, 113, 227, 0.16) 0%, rgba(0, 113, 227, 0) 70%);
  top: 5%;
  left: -80px;
  animation: auroraFloat1 18s ease-in-out infinite alternate;
}

.aurora-glow-2 {
  width: 230px;
  height: 230px;
  background: radial-gradient(circle, rgba(88, 86, 214, 0.12) 0%, rgba(88, 86, 214, 0) 70%);
  top: 35%;
  right: -80px;
  animation: auroraFloat2 20s ease-in-out infinite alternate-reverse;
}

.aurora-glow-3 {
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(90, 200, 250, 0.14) 0%, rgba(90, 200, 250, 0) 70%);
  top: 70%;
  left: 20%;
  animation: auroraFloat1 22s ease-in-out infinite alternate-reverse;
}

@keyframes auroraFloat1 {
  0% { transform: translate(0, 0) scale(1) rotate(0deg); }
  100% { transform: translate(30px, 40px) scale(1.15) rotate(45deg); }
}

@keyframes auroraFloat2 {
  0% { transform: translate(0, 0) scale(1) rotate(0deg); }
  100% { transform: translate(-20px, -45px) scale(1.1) rotate(-30deg); }
}

/* Decorative SVG charts inside Bento Grid */
.glucose-mini-chart {
  position: absolute;
  bottom: 36px;
  left: 0;
  right: 0;
  height: 32px;
  width: 100%;
  pointer-events: none;
}

.progress-mini-ring {
  position: absolute;
  right: 16px;
  top: 36px;
  width: 26px;
  height: 26px;
  transform: rotate(-90deg);
  pointer-events: none;
  opacity: 0.85;
}

.ai-vector-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0.65;
}
</style>
