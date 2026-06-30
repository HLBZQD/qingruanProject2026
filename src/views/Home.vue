<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'
import { escapeHtml, sanitizeHtml } from '@/utils/sanitize'
import { useHomeStore } from '@/stores/homeStore'
import type { DiabetesTypeView } from '@/stores/homeStore'
import type { Article, DiabetesType, DiabetesTypeDetail } from '@/types/api'
import AppIcon from '@/components/icons/AppIcon.vue'
import DiabetesIcon from '@/components/icons/DiabetesIcon.vue'

const router = useRouter()
const homeStore = useHomeStore()

const FALLBACK_ARTICLE_COVER = '/static/images/placeholder-article.svg'
const FALLBACK_DOCTOR_AVATAR = '/static/images/placeholder-doctor.svg'

interface Banner {
  id: number
  title: string
  subtitle: string
  stat: string
  icon: string
  color: string
}
const banners: Banner[] = [
  { id: 1, title: '科学控糖', subtitle: '个性化方案，从今天开始', stat: '7×24', icon: 'pulse', color: '#06D6A0' },
  { id: 2, title: 'AI 医师在线', subtitle: '专业咨询，触手可及', stat: 'AI', icon: 'doctor-bag', color: '#FF6B6B' },
  { id: 3, title: '每日健康打卡', subtitle: '记录每一份坚持', stat: '365', icon: 'medical-note', color: '#F59E0B' },
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

const doctors = computed(() => homeStore.doctors)
const articles = computed(() => homeStore.articles.slice(0, 3))
const diabetesTypes = computed<DiabetesTypeView[]>(() => homeStore.diabetesTypes)

const articleCover = (a: Article): string => a.cover || FALLBACK_ARTICLE_COVER
const articleViews = (a: Article): number => a.views
const articleSummary = (a: Article): string => a.summary

function typeStyle(id: number): { bg: string; accent: string } {
  const m = id % 4
  if (m === 1) return { bg: '#EEF2FF', accent: '#4F46E5' }
  if (m === 2) return { bg: '#FFF0F0', accent: '#FF6B6B' }
  if (m === 3) return { bg: '#E0FDF6', accent: '#06D6A0' }
  return { bg: '#FEF3C7', accent: '#F59E0B' }
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
    inputAttributes: {
      'aria-label': '搜索关键词',
    },
    showCancelButton: true,
    confirmButtonText: '搜索',
    cancelButtonText: '取消',
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
      ? `<h4 style="color:#4F46E5;font-size:15px;margin:14px 0 6px;text-align:left;font-weight:700">${label}</h4>` +
        `<p style="font-size:13px;line-height:1.7;color:#4B5563;margin:0;text-align:left">${escapeHtml(body)}</p>`
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
    confirmButtonColor: '#4F46E5',
    width: 340,
  })
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
})
onUnmounted(() => {
  stopAuto()
})
</script>

<template>
  <div class="home-page page-enter">
    <!-- A. 顶部 Header -->
    <header class="home-header">
      <div class="header-shapes" aria-hidden="true">
        <span class="shape-dot shape-dot-1"></span>
        <span class="shape-dot shape-dot-2"></span>
        <span class="shape-ring"></span>
      </div>
      <div class="home-header-inner">
        <div class="home-header-left">
          <div class="home-logo">
            <DiabetesIcon name="diabetes" :size="20" color="#fff" />
          </div>
          <div>
            <h1 class="home-title">糖尿病预治智能助手</h1>
            <p class="home-subtitle">科学控糖 · 智慧生活</p>
          </div>
        </div>
        <button class="home-search-btn" aria-label="搜索" @click="onSearch">
          <AppIcon name="search" :size="16" />
        </button>
      </div>
      <div class="header-wave" aria-hidden="true">
        <svg viewBox="0 0 400 48" preserveAspectRatio="none">
          <path d="M0,0 L0,20 Q100,48 200,20 T400,20 L400,0 Z" fill="var(--color-bg)" />
        </svg>
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
          :style="{ '--banner-accent': b.color }"
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
            <h2 class="banner-title">{{ b.title }}</h2>
            <p class="banner-subtitle">{{ b.subtitle }}</p>
            <button class="banner-cta" @click.stop="nextBanner">
              立即了解 <AppIcon name="arrow-right" :size="10" />
            </button>
          </div>
          <div class="banner-stat">
            <span class="banner-stat-value font-mono">{{ b.stat }}</span>
            <DiabetesIcon :name="b.icon" :size="52" color="rgba(255,255,255,0.25)" />
          </div>
        </div>
        <div class="banner-dots">
          <span
            v-for="(b, i) in banners"
            :key="b.id"
            :class="['swiper-dot', current === i ? 'active' : '']"
            @click.stop="current = i"
          ></span>
        </div>
      </div>
    </div>

    <!-- C. 专业医师团队 -->
    <section class="home-section stagger-item">
      <div class="section-head">
        <div class="section-title-wrap">
          <span class="section-icon-wrap section-icon-indigo">
            <DiabetesIcon name="stethoscope" :size="16" color="#fff" />
          </span>
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

    <!-- D. 健康科普 -->
    <section class="home-section stagger-item">
      <div class="section-head">
        <div class="section-title-wrap">
          <span class="section-icon-wrap section-icon-coral">
            <DiabetesIcon name="medical-note" :size="16" color="#fff" />
          </span>
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
      <div v-else class="article-list">
        <article v-for="a in articles" :key="a.id" class="article-card" @click="goArticle(a.id)">
          <span class="article-color-bar" aria-hidden="true"></span>
          <img class="article-cover" :src="articleCover(a)" :alt="a.title" @error="hideImg" />
          <div class="article-body">
            <div>
              <span class="article-category">{{ a.category }}</span>
              <h3 class="article-title">{{ a.title }}</h3>
            </div>
            <div>
              <p v-if="articleSummary(a)" class="article-summary">{{ articleSummary(a) }}</p>
              <div class="article-meta">
                <span><AppIcon name="eye" :size="12" />{{ articleViews(a) }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- E. 糖尿病类型 -->
    <section class="home-section stagger-item">
      <div class="section-head">
        <div class="section-title-wrap">
          <span class="section-icon-wrap section-icon-mint">
            <DiabetesIcon name="pills" :size="16" color="#fff" />
          </span>
          <h2 class="section-title">糖尿病类型</h2>
        </div>
        <span class="section-link-static">
          全部 <AppIcon name="arrow-right" :size="10" />
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
          v-for="t in diabetesTypes"
          :key="t.id"
          class="type-card"
          :style="{ background: typeStyle(t.id).bg, '--type-accent': typeStyle(t.id).accent }"
          @click="showDiabetesType(t)"
        >
          <div class="type-cover-wrap">
            <img v-if="t.cover" class="type-cover" :src="t.cover" :alt="t.name" @error="hideImg" />
            <div class="type-cover-overlay"></div>
            <h3 class="type-name">{{ t.name }}</h3>
          </div>
          <div class="type-brief-wrap">
            <p class="type-brief">{{ t.brief }}</p>
          </div>
        </article>
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
  padding-bottom: calc(var(--tab-bar-height) + 8px);
  background: var(--color-bg);
  position: relative;
}

/* ============ A. Header ============ */
.home-header {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--color-card);
  padding: 48px var(--spacing-lg) 0;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(26, 26, 46, 0.04);
}

.header-shapes {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.shape-dot {
  position: absolute;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
}

.shape-dot-1 {
  width: 12px;
  height: 12px;
  top: 24px;
  right: 80px;
}

.shape-dot-2 {
  width: 8px;
  height: 8px;
  top: 36px;
  right: 64px;
  background: var(--color-accent);
}

.shape-ring {
  position: absolute;
  width: 80px;
  height: 80px;
  top: -30px;
  right: -24px;
  border-radius: 24%;
  border: 2px solid var(--color-primary-soft);
  opacity: 0.5;
  transform: rotate(15deg);
}

.home-header-inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
}

.home-header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.home-logo {
  width: 40px;
  height: 40px;
  background: var(--color-primary);
  border-radius: 24%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  transform: rotate(3deg);
  transition: transform var(--transition-fast);
}

.home-logo:active {
  transform: rotate(0deg) scale(0.95);
}

.home-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.25;
  letter-spacing: -0.01em;
}

.home-subtitle {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin-top: 2px;
  font-weight: 500;
}

.home-search-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  border: 1.5px solid var(--color-divider);
  border-radius: 24%;
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.home-search-btn:active {
  background: var(--color-primary-light);
  color: var(--color-primary);
  border-color: var(--color-primary-soft);
}

.header-wave {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 24px;
  transform: translateY(1px);
}

.header-wave svg {
  width: 100%;
  height: 100%;
  display: block;
}

/* ============ 区块通用 ============ */
.home-section {
  padding: 0 var(--spacing-lg);
  margin-top: 28px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
}

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-icon-wrap {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.section-icon-indigo {
  background: var(--color-primary);
}

.section-icon-coral {
  background: var(--color-vivid);
}

.section-icon-mint {
  background: var(--color-accent);
}

.section-title {
  font-size: var(--font-size-h3);
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: -0.01em;
}

.section-link {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color var(--transition-fast);
  font-weight: 600;
}

.section-link:active {
  color: var(--color-primary);
}

.section-link .app-icon {
  margin-left: 4px;
}

.section-link-static {
  font-size: var(--font-size-caption);
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  font-weight: 600;
}

.section-link-static .app-icon {
  margin-left: 4px;
}

/* ============ B. Banner ============ */
.home-banner-wrap {
  padding: 0 var(--spacing-lg);
  margin-top: var(--spacing-lg);
}

.banner-frame {
  position: relative;
  border-radius: var(--radius-3xl);
  overflow: hidden;
  height: 168px;
  background: var(--color-primary);
  cursor: pointer;
  box-shadow: var(--shadow-primary);
}

.banner-slide {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  color: #fff;
  transition: opacity 0.5s ease;
}

.banner-shapes {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.banner-shape {
  position: absolute;
  border-radius: 24%;
}

.banner-shape-1 {
  width: 120px;
  height: 120px;
  background: var(--color-vivid);
  opacity: 0.2;
  top: -40px;
  right: -20px;
  transform: rotate(15deg);
}

.banner-shape-2 {
  width: 80px;
  height: 80px;
  background: var(--color-accent);
  opacity: 0.25;
  bottom: -20px;
  left: 40%;
  transform: rotate(-10deg);
}

.banner-shape-3 {
  width: 48px;
  height: 48px;
  background: var(--color-amber);
  opacity: 0.2;
  top: 30px;
  left: 30px;
  border-radius: 30%;
}

.banner-text {
  position: relative;
  z-index: 10;
  flex: 1;
  min-width: 0;
}

.banner-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: var(--color-accent);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.12);
  padding: 3px 8px;
  border-radius: var(--radius-tag);
}

.banner-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 4px;
  letter-spacing: -0.02em;
}

.banner-subtitle {
  font-size: var(--font-size-caption);
  color: rgba(255, 255, 255, 0.75);
  margin-bottom: var(--spacing-md);
  font-weight: 500;
}

.banner-cta {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: var(--font-size-caption);
  font-weight: 700;
  padding: 8px 16px;
  border-radius: var(--radius-button);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.banner-cta:active {
  background: rgba(255, 255, 255, 0.25);
}

.banner-stat {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--spacing-sm);
}

.banner-stat-value {
  font-size: 34px;
  font-weight: 700;
  color: var(--color-accent);
  line-height: 1;
  text-shadow: 0 0 20px rgba(6, 214, 160, 0.45);
}

.banner-dots {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  z-index: 20;
}

.swiper-dot {
  height: 6px;
  width: 6px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  transition: width 0.3s ease, background 0.3s ease;
}

.swiper-dot.active {
  width: 20px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
}

/* ============ C. 医师团队 ============ */
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
  border-radius: var(--radius-3xl);
  padding: var(--spacing-md);
  min-width: 140px;
  border: 1.5px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  overflow: hidden;
}

.doctor-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 46px;
  background: var(--color-primary-light);
  border-radius: var(--radius-3xl) var(--radius-3xl) 0 0;
}

.doctor-card:active {
  transform: translateY(-2px);
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
  animation: dataPulse 2s ease-in-out infinite;
}

.doctor-name {
  text-align: center;
  font-weight: 700;
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
  font-weight: 600;
}

/* ============ D. 健康科普 ============ */
.article-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.article-card {
  position: relative;
  background: var(--color-card);
  border-radius: var(--radius-xl);
  padding: var(--spacing-md);
  border: 1.5px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  display: flex;
  gap: var(--spacing-md);
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  overflow: hidden;
}

.article-card:active {
  transform: scale(0.98);
  box-shadow: var(--shadow-md);
}

.article-color-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  background: var(--color-vivid);
  border-radius: var(--radius-xl) 0 0 var(--radius-xl);
}

.article-cover {
  width: 88px;
  height: 88px;
  border-radius: var(--radius-md);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--color-divider);
}

.article-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.article-category {
  font-size: var(--font-size-xs);
  color: var(--color-vivid-dark);
  background: var(--color-vivid-light);
  padding: 2px 8px;
  border-radius: var(--radius-tag);
  align-self: flex-start;
  font-weight: 600;
}

.article-title {
  font-size: var(--font-size-body);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-top: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
  letter-spacing: -0.01em;
}

.article-summary {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  margin-top: 4px;
  margin-bottom: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.article-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
}

.article-meta .app-icon {
  margin-right: 2px;
}

/* ============ E. 糖尿病类型 ============ */
.type-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-md);
}

.type-card {
  position: relative;
  background: var(--color-card);
  border-radius: var(--radius-asymmetric);
  overflow: hidden;
  border: 1.5px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.type-card:nth-child(even) {
  border-radius: var(--radius-asymmetric-alt);
}

.type-card:active {
  transform: translateY(-2px) scale(0.98);
  box-shadow: var(--shadow-md);
}

.type-card::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 48px;
  height: 48px;
  background: var(--type-accent, var(--color-primary));
  opacity: 0.1;
  border-radius: 0 0 0 40px;
}

.type-cover-wrap {
  height: 88px;
  overflow: hidden;
  position: relative;
  background: var(--type-accent, var(--color-primary));
}

.type-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0.9;
}

.type-cover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(26, 26, 46, 0.75), transparent);
}

.type-name {
  position: absolute;
  bottom: var(--spacing-sm);
  left: var(--spacing-md);
  color: #fff;
  font-weight: 700;
  font-size: var(--font-size-body);
  z-index: 2;
  letter-spacing: -0.01em;
}

.type-brief-wrap {
  padding: 10px;
  background: var(--color-card);
}

.type-brief {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
  height: 138px;
  border-radius: var(--radius-asymmetric);
}

/* ============ 空态/错误态 ============ */
.block-empty {
  padding: 32px 0;
  text-align: center;
}

.block-empty-text {
  font-size: var(--font-size-caption);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-sm);
}

.retry-btn {
  color: var(--color-primary);
  font-size: var(--font-size-caption);
  text-decoration: underline;
  background: transparent;
  border: none;
  cursor: pointer;
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .online-dot,
  .doctor-skeleton,
  .article-skeleton,
  .type-skeleton {
    animation: none;
  }
}
</style>
