<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import DOMPurify from 'dompurify'
import Swal from 'sweetalert2'
import { useHomeStore } from '@/stores/homeStore'
import type { Article, DiabetesType, DiabetesTypeDetail } from '@/types/api'

const router = useRouter()
const homeStore = useHomeStore()

// 占位常量（与 store 内同名常量保持一致值；store 不暴露常量，故组件自带）
const FALLBACK_ARTICLE_COVER = '/static/images/placeholder-article.svg'
const FALLBACK_DOCTOR_AVATAR = '/static/images/placeholder-doctor.svg'

// 展示视图类型（与 store 内 DiabetesTypeView 结构一致；store 不导出，故组件自带）
interface DiabetesTypeView extends DiabetesType {
  cover: string
  brief: string
}

// ===== 轮播 Banner（复刻 prototype banners 3 条） =====
interface Banner {
  id: number
  title: string
  subtitle: string
  gradientClass: string
  icon: string
}
const banners: Banner[] = [
  { id: 1, title: '科学控糖 · 智慧生活', subtitle: '个性化方案，从今天开始', gradientClass: 'banner-grad-1', icon: 'fa-heart-pulse' },
  { id: 2, title: 'AI 医师 7×24 在线', subtitle: '专业咨询，触手可及', gradientClass: 'banner-grad-2', icon: 'fa-user-doctor' },
  { id: 3, title: '每日打卡 · 健康相伴', subtitle: '记录每一份坚持', gradientClass: 'banner-grad-3', icon: 'fa-calendar-check' },
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

// ===== 派生展示数据 =====
const doctors = computed(() => homeStore.doctors)
const articles = computed(() => homeStore.articles.slice(0, 3)) // 取前 3 条（store 已取 3，二次保险）
const diabetesTypes = computed<DiabetesTypeView[]>(() => homeStore.diabetesTypes)

// 阅读量/封面展示助手（直接取契约字段，无 read_count 兜底）
const articleCover = (a: Article): string => a.cover || FALLBACK_ARTICLE_COVER
const articleViews = (a: Article): number => a.views
const articleSummary = (a: Article): string => a.summary

// 按 id 选 4 组主色渐变 scoped 类（与原型 mock 4 色一致）
function typeGradientClass(id: number): string {
  const m = id % 4
  if (m === 1) return 'type-grad-1'
  if (m === 2) return 'type-grad-2'
  if (m === 3) return 'type-grad-3'
  return 'type-grad-4'
}

// 区块加载/错误态（供模板判定）
const doctorsLoading = computed(() => homeStore.loading && doctors.value.length === 0 && !homeStore.doctorsError)
const articlesLoading = computed(() => homeStore.loading && articles.value.length === 0 && !homeStore.articlesError)
const typesLoading = computed(() => homeStore.loading && diabetesTypes.value.length === 0 && !homeStore.typesError)

// ===== 跳转 =====
function goDoctor(): void {
  // Consultation 页是否接受 ?doc=id query 未确认；本任务仅跳 tab，不带 query，不臆造对话页
  router.push('/consultation')
}
function goArticle(_id: number): void {
  // 文章详情页不在本任务；仅跳资讯 tab
  router.push('/news')
}
function goNewsList(): void {
  router.push('/news')
}
function onSearch(): void {
  // prototype 仅占位；弹 Swal 提示开发中
  void Swal.fire({
    toast: true,
    position: 'top',
    icon: 'info',
    title: '搜索功能开发中',
    showConfirmButton: false,
    timer: 1800,
    timerProgressBar: true,
  })
}

// ===== 糖尿病类型弹层（SweetAlert2 + DOMPurify） =====
// 列表项已含完整三段文本；按需拉详情（接口存在），失败回退列表项数据。
// 单次 Swal.fire，不重弹、不 update。
async function showDiabetesType(t: DiabetesType): Promise<void> {
  const detail = await homeStore.fetchDiabetesTypeDetail(t.id)
  const data: DiabetesTypeDetail = detail ?? t
  openTypeSwal(data)
}

function openTypeSwal(t: DiabetesTypeDetail): void {
  // buildSection：纯文本段拼成带标签的 HTML 结构；DOMPurify 在最终 html 整体净化一次（不双重净化）。
  const buildSection = (label: string, body?: string): string =>
    body
      ? `<h4 style="color:#4A90D9;font-size:15px;margin:12px 0 4px;text-align:left">${label}</h4>` +
        `<p style="font-size:13px;line-height:1.6;color:#333;margin:0;text-align:left">${escapeHtml(body)}</p>`
      : ''
  const html = DOMPurify.sanitize(
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
    width: 340,
  })
}

// 纯文本转义（字段为纯文本时防止文本里含 < > & 破坏 HTML 结构；与 DOMPurify 双保险但无双重净化语义）
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ===== img onerror 回退（占位资源缺失兜底） =====
function hideImg(e: Event): void {
  ;(e.target as HTMLImageElement).style.display = 'none'
}

// ===== 区块重试（供降级 UI 调用） =====
function retryDoctors(): void {
  void homeStore.retryDoctors()
}
function retryArticles(): void {
  void homeStore.retryArticles()
}
function retryTypes(): void {
  void homeStore.retryTypes()
}

// ===== 生命周期 =====
onMounted(() => {
  startAuto()
  void homeStore.fetchHomeData() // fire-and-forget；store 内部管 loading/error
})
onUnmounted(() => {
  stopAuto()
})
</script>

<template>
  <div class="home-page page-enter">
    <!-- A. 顶部 Header（sticky） -->
    <header class="home-header">
      <div class="home-header-left">
        <div class="home-logo"><i class="fa-solid fa-heart-pulse"></i></div>
        <div>
          <h1 class="home-title">糖尿病预治智能助手</h1>
          <p class="home-subtitle">科学控糖 · 智慧生活</p>
        </div>
      </div>
      <button class="home-search-btn" aria-label="搜索" @click="onSearch">
        <i class="fa-solid fa-magnifying-glass"></i>
      </button>
    </header>

    <!-- B. 轮播 Banner -->
    <div class="home-banner-wrap">
      <div class="banner-frame" @click="nextBanner">
        <div
          v-for="(b, i) in banners"
          :key="b.id"
          v-show="current === i"
          :class="['banner-slide', 'banner-glow', b.gradientClass]"
        >
          <div class="banner-text">
            <h2 class="banner-title">{{ b.title }}</h2>
            <p class="banner-subtitle">{{ b.subtitle }}</p>
            <button class="banner-cta" @click.stop="nextBanner">立即了解 →</button>
          </div>
          <i class="fa-solid banner-icon" :class="b.icon"></i>
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
    <section class="home-section">
      <div class="section-head">
        <h2 class="section-title">专业医师团队</h2>
        <button class="section-link" @click="goDoctor">
          查看全部 <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>

      <!-- 错误态 -->
      <div v-if="homeStore.doctorsError" class="block-empty">
        <p class="block-empty-text">医师列表加载失败</p>
        <button class="retry-btn" @click="retryDoctors">点击重试</button>
      </div>
      <!-- 加载态 -->
      <div v-else-if="doctorsLoading" class="doctor-scroll">
        <div v-for="n in 3" :key="`ds-${n}`" class="doctor-skeleton"></div>
      </div>
      <!-- 正常态 -->
      <div v-else-if="doctors.length === 0" class="block-empty">
        <p class="block-empty-text">暂无可咨询医师</p>
        <button class="retry-btn" @click="retryDoctors">点击重试</button>
      </div>
      <div v-else class="doctor-scroll">
        <div v-for="doc in doctors" :key="doc.id" class="doctor-card" @click="goDoctor">
          <div class="doctor-avatar-wrap">
            <div class="avatar-ring">
              <img
                class="doctor-avatar"
                :src="doc.avatar || FALLBACK_DOCTOR_AVATAR"
                :alt="doc.name"
                @error="hideImg"
              />
            </div>
          </div>
          <p class="doctor-name">{{ doc.name }}</p>
          <p class="doctor-dept">{{ doc.department }}</p>
          <span class="doctor-title">{{ doc.title }}</span>
        </div>
      </div>
    </section>

    <!-- D. 健康科普 -->
    <section class="home-section">
      <div class="section-head">
        <h2 class="section-title">健康科普</h2>
        <button class="section-link" @click="goNewsList">
          更多 <i class="fa-solid fa-chevron-right"></i>
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
          <img class="article-cover" :src="articleCover(a)" :alt="a.title" @error="hideImg" />
          <div class="article-body">
            <div>
              <span class="article-category">{{ a.category }}</span>
              <h3 class="article-title">{{ a.title }}</h3>
            </div>
            <div>
              <p v-if="articleSummary(a)" class="article-summary">{{ articleSummary(a) }}</p>
              <div class="article-meta">
                <span><i class="fa-regular fa-eye"></i>{{ articleViews(a) }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- E. 糖尿病类型 -->
    <section class="home-section">
      <div class="section-head">
        <h2 class="section-title">糖尿病类型</h2>
        <span class="section-link-static">
          全部 <i class="fa-solid fa-chevron-right"></i>
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
          @click="showDiabetesType(t)"
        >
          <div :class="['type-cover-wrap', typeGradientClass(t.id)]">
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

/* ============ page-enter 入场动画 ============ */
.page-enter {
  animation: pageEnter 0.3s ease;
}
@keyframes pageEnter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* ============ A. Header ============ */
.home-header {
  background: var(--color-card);
  padding: 48px var(--spacing-lg) 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 30;
  box-shadow: var(--shadow-sm);
}
.home-header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}
.home-logo {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
  flex-shrink: 0;
}
.home-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-primary);
  line-height: 1.25;
}
.home-subtitle {
  font-size: 10px;
  color: #94a3b8;
}
.home-search-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: opacity var(--transition-fast);
  flex-shrink: 0;
}
.home-search-btn:active {
  opacity: 0.6;
}

/* ============ 区块通用 ============ */
.home-section {
  padding: 0 var(--spacing-lg);
  margin-top: 20px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
}
.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-primary);
}
.section-link {
  font-size: 12px;
  color: var(--color-primary);
  display: flex;
  align-items: center;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: opacity var(--transition-fast);
}
.section-link:active {
  opacity: 0.6;
}
.section-link i {
  margin-left: 4px;
  font-size: 10px;
}
.section-link-static {
  font-size: 12px;
  color: var(--color-primary);
  display: flex;
  align-items: center;
}
.section-link-static i {
  margin-left: 4px;
  font-size: 10px;
}

/* ============ B. Banner ============ */
.home-banner-wrap {
  padding: 0 var(--spacing-lg);
  margin-top: var(--spacing-md);
}
.banner-frame {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  height: 144px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  cursor: pointer;
}
.banner-slide {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  padding: 0 24px;
  color: #fff;
  transition: opacity 0.5s ease;
}
/* 3 组渐变（对齐 prototype banners） */
.banner-grad-1 {
  background: linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #0ea5e9 100%);
}
.banner-grad-2 {
  background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 50%, #06b6d4 100%);
}
.banner-grad-3 {
  background: linear-gradient(135deg, #06b6d4 0%, #0ea5e9 50%, #3b82f6 100%);
}
.banner-glow {
  position: relative;
}
.banner-glow::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.25), transparent 60%);
  animation: bannerGlow 3s ease-in-out infinite alternate;
}
@keyframes bannerGlow {
  from {
    opacity: 0.4;
  }
  to {
    opacity: 0.9;
  }
}
.banner-text {
  position: relative;
  z-index: 10;
  flex: 1;
}
.banner-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 4px;
}
.banner-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: var(--spacing-md);
}
.banner-cta {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 16px;
  border-radius: var(--radius-full);
  border: none;
  cursor: pointer;
}
.banner-icon {
  position: relative;
  z-index: 10;
  font-size: 60px;
  color: rgba(255, 255, 255, 0.2);
}
.banner-dots {
  position: absolute;
  bottom: 12px;
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
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: width 0.3s ease, background 0.3s ease;
}
.swiper-dot.active {
  width: 16px;
  background: rgba(255, 255, 255, 0.95);
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
  background: var(--color-card);
  border-radius: 16px;
  padding: var(--spacing-md);
  min-width: 140px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.doctor-card:active {
  transform: scale(0.97);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}
.doctor-avatar-wrap {
  position: relative;
  width: 64px;
  height: 64px;
  margin: 0 auto var(--spacing-sm);
}
.avatar-ring {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-full);
  padding: 2px;
  background: linear-gradient(135deg, #4a90d9, #38bdf8);
  box-shadow: 0 0 0 0 rgba(74, 144, 217, 0.4);
  animation: avatarRing 2.4s ease-in-out infinite;
}
.avatar-ring > .doctor-avatar {
  width: 100%;
  height: 100%;
  border: 2px solid #fff;
  border-radius: var(--radius-full);
  object-fit: cover;
  background: #f1f5f9;
}
@keyframes avatarRing {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(74, 144, 217, 0.45);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(74, 144, 217, 0);
  }
}
.doctor-name {
  text-align: center;
  font-weight: 700;
  font-size: 14px;
  color: var(--color-text-primary);
}
.doctor-dept {
  text-align: center;
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}
.doctor-title {
  display: block;
  text-align: center;
  font-size: 10px;
  color: var(--color-primary);
  background: var(--color-primary-light);
  padding: 2px var(--spacing-sm);
  border-radius: var(--radius-full);
  margin-top: 6px;
}

/* ============ D. 健康科普 ============ */
.article-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}
.article-card {
  background: var(--color-card);
  border-radius: 16px;
  padding: var(--spacing-md);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  display: flex;
  gap: var(--spacing-md);
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.article-card:active {
  transform: scale(0.97);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}
.article-cover {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-lg);
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
  font-size: 10px;
  color: var(--color-primary);
  background: var(--color-primary-light);
  padding: 2px var(--spacing-sm);
  border-radius: var(--radius-full);
  align-self: flex-start;
}
.article-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.35;
}
.article-summary {
  font-size: 11px;
  color: #94a3b8;
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
  font-size: 11px;
  color: #94a3b8;
}
.article-meta i {
  margin-right: 2px;
}

/* ============ E. 糖尿病类型 ============ */
.type-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-md);
}
.type-card {
  background: var(--color-card);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.type-card:active {
  transform: scale(0.97);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}
.type-cover-wrap {
  height: 80px;
  overflow: hidden;
  position: relative;
}
/* 4 组渐变（对齐 prototype diabetesTypes color） */
.type-grad-1 {
  background: linear-gradient(135deg, #3b82f6, #6366f1);
}
.type-grad-2 {
  background: linear-gradient(135deg, #0ea5e9, #06b6d4);
}
.type-grad-3 {
  background: linear-gradient(135deg, #ec4899, #f43f5e);
}
.type-grad-4 {
  background: linear-gradient(135deg, #8b5cf6, #a855f7);
}
.type-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.type-cover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55), transparent);
}
.type-name {
  position: absolute;
  bottom: var(--spacing-sm);
  left: var(--spacing-md);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  z-index: 2;
}
.type-brief-wrap {
  padding: 10px;
}
.type-brief {
  font-size: 11px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ============ 骨架屏（pulse 动画） ============ */
.doctor-skeleton,
.article-skeleton,
.type-skeleton {
  background: var(--color-divider);
  border-radius: var(--radius-md);
  animation: skeletonPulse 1.4s ease-in-out infinite;
}
@keyframes skeletonPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
.doctor-skeleton {
  min-width: 140px;
  height: 180px;
  flex-shrink: 0;
}
.article-skeleton {
  height: 96px;
}
.type-skeleton {
  height: 130px;
}

/* ============ 空态/错误态 ============ */
.block-empty {
  padding: 32px 0;
  text-align: center;
}
.block-empty-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-sm);
}
.retry-btn {
  color: var(--color-primary);
  font-size: 12px;
  text-decoration: underline;
  background: transparent;
  border: none;
  cursor: pointer;
}
</style>
