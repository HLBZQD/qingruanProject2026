# 详细技术设计 detail_v1（R2 修订版）— 系统首页 Home（Task 1）

> 分支：`202606271219_home_plan_punch_frontend`（禁止切分支）
> 产出方：Designer → Coder → Verifier
> 范围：仅 Task 1 = 系统首页 Home（`src/views/Home.vue` 完整重写 + 配套 types/store/composables）
> 视觉与交互唯一基准：`docs/prototype.html` 首页模板（约 408-523 行）+ Mock 数据（约 144-203 行）
> R2 修订依据：`design_review_v1_r1.md`（C1/C2 阻断 + M1–M8 一般问题，本轮全部修订）

---

## 0. 后端接口返回形态确认（解包路径的依据）

核对 `docs/2_detailed_design_v3.md` 第 6 节 API 规格（3.2.9 / 3.2.19 / 3.2.24 / 3.8.1 / 3.8.3）与项目既有范式 `src/views/Risk.vue`，结论如下。

**关键事实（修正 C1）**：`/api/doctors`、`/api/articles` 两个分页端点的 HTTP body 形态是 `{ success, data: T[], pagination }`——`pagination` 与 `data` **平级在最外层（即 HTTP body 本身）**，**并非嵌套在 `data` 内**。即 HTTP body 本身就是 `PaginatedResponse<T>` 的超集（多一个 `success`/`message`），**不是 `ApiResponse<PaginatedResponse<T>>`**。因此数组取 `res.data.data`，分页取 `res.data.pagination`（与 `Risk.vue` 第 282-287 行 `/risk/history` 写法一致）。

`res` 为 axios 响应对象，`res.data` = HTTP body。下表「外壳列」标注的是 `api.get<T>` 的泛型参数 `T`（即 `res.data` 的类型）。

| 端点 | `api.get<T>` 泛型 T（= res.data 类型） | data 字段形态 | 解包路径（业务数组/对象） | 分页? |
|---|---|---|---|---|
| `GET /api/doctors` | `PaginatedResponse<Doctor>` | `Doctor[]`（`pagination` 平级） | `res.data.data`（数组）/ `res.data.pagination` | 是 |
| `GET /api/doctors/:id` | `ApiResponse<Doctor>` | `Doctor`（单对象） | `res.data.data` | 否 |
| `GET /api/articles` | `PaginatedResponse<Article>` | `Article[]`（`pagination` 平级） | `res.data.data`（数组）/ `res.data.pagination` | 是 |
| `GET /api/articles/:id` | `ApiResponse<ArticleDetail>` | `ArticleDetail`（单对象） | `res.data.data` | 否 |
| `GET /api/diabetes-types` | `ApiResponse<DiabetesType[]>` | `DiabetesType[]`（无 pagination） | `res.data.data`（数组） | **否（数组直返，非分页）** |
| `GET /api/diabetes-types/:id` | `ApiResponse<DiabetesType>` | `DiabetesType`（单对象，详情与列表字段一致） | `res.data.data` | 否 |

> 既有 `src/types/api.ts` 已定义：
> - `ApiResponse<T> = { success: boolean; data: T; message?: string }`
> - `PaginatedResponse<T> = { data: T[]; pagination: PaginationInfo }`
> - `PaginationInfo = { page, pageSize, total, totalPages }`
>
> 因 HTTP body 是 `{ success, data: T[], pagination }`，与 `PaginatedResponse<T>` 字段集合（无 `success`）相比多了 `success`/`message`。为通过 `vue-tsc` 且解包路径精准，本设计对分页端点泛型声明为 `{ success: boolean; data: T[]; pagination: PaginationInfo }`（一个内联结构，语义等同 `PaginatedResponse<T> & { success: boolean }`），不套 `ApiResponse<>` 外壳，避免 `res.data.data.data` 这种错误访问。详见 §3。
>
> 字段名核对结论（修正 M2/M1）：
> - **Article**：权威契约 3.8.3 字段为 `id, title, cover: string|null, author, category, tags: string[], summary, views: number, created_at: string`，全部必填（`cover` 为 `string | null`，不是 `?:`）。3.2.19 字段说明已明确 `created_at`↔`publish_time`、`views`↔`read_count` 为**语义映射、不是双字段并存**，故类型上**只保留 `views`/`created_at`**，不引入 `read_count`/`publish_time`。
> - **DiabetesType**：3.8.3 字段为 `id: number, name, image: string|null, pathogenesis, manifestation, treatment`，`id` 为 `number`（非联合）。
> - **Doctor**：复用既有 `Doctor`（`avatar: string | null`，无 `online` 字段）。

---

## 1. 类型清单（落在 `src/types/api.ts`，仅增补，勿动既有）

### 1.1 复用既有（不重复定义）
- `ApiResponse<T>`、`PaginatedResponse<T>`、`PaginationParams`、`PaginationInfo`（见 §0 引用，已在文件中）
- `Doctor = { id: number; name: string; department: string; title: string; description: string; avatar: string | null }`

### 1.2 新增 `Article`（列表摘要，不含 content）— 修正 M2，字段严格对齐 3.8.3

```ts
/**
 * 健康科普文章列表项（GET /api/articles 的 data 数组元素，无完整正文 content）。
 * 字段严格对齐 docs/2_detailed_design_v3.md 3.8.3 / 3.2.19（v13 修订后稳定返回）。
 * 注意：3.2.19 注释中 created_at↔publish_time、views↔read_count 为语义映射，
 *       后端只返回 created_at / views，不引入别名字段，避免类型允许不可能状态。
 */
export interface Article {
  id: number;
  title: string;
  /** 封面图 URL；契约为 string | null（可空但字段存在）。缺失时组件回退占位图 */
  cover: string | null;
  author: string;
  category: string;
  /** 标签数组；DB 以 TEXT(JSON) 存储，Express 已 JSON.parse 降级为 [] */
  tags: string[];
  /** 文章摘要（列表卡片副文案）；v13 修订后稳定返回 */
  summary: string;
  /** 阅读量；对应需求 6.7 节 read_count，后端字段名为 views */
  views: number;
  /** 发布时间 ISO 字符串；对应需求 6.7 节 publish_time，后端字段名为 created_at */
  created_at: string;
}
```

> 展示口径（编码直接照用，见 §6）：
> - 封面：`a.cover || FALLBACK_ARTICLE_COVER`（`cover` 为 null 时回退）
> - 分类标签：`a.category`（契约必填；为兜底异常数据可 `a.category || '健康科普'`，但类型上必填）
> - 阅读量：`a.views`（直接取，无 `?? a.read_count`）
> - 摘要：`a.summary`（契约必填；渲染时若为空串则隐藏副文案行，不臆造）
> - 发布时间：首页卡片**不展示**时间（prototype 仅显示阅读量），字段保留供后续详情页用

### 1.3 新增 `DiabetesType` / `DiabetesTypeDetail`— 修正 M1，对齐 3.8.3

后端 3.8.3 字段为 `image: string | null`（列表与详情一致），原型使用 `cover`+`brief`+`color`。设计以后端字段为准，原型展示字段（`brief` 展示用副文案、`color` 渐变）由前端展示层处理，**不污染类型**：

```ts
/**
 * 糖尿病类型（GET /api/diabetes-types 列表元素，与 GET /api/diabetes-types/:id 详情字段一致）。
 * 字段对齐 docs/2_detailed_design_v3.md 3.8.3 / 3.2.24。
 * id 为后端 number 主键（修正 M1：不再设为 number | string 联合）。
 */
export interface DiabetesType {
  id: number;
  name: string;
  /** 后端真实字段名为 image；string | null，缺失时组件用主色渐变叠层占位 */
  image: string | null;
  pathogenesis: string;
  manifestation: string;
  treatment: string;
}

/**
 * 糖尿病类型详情（GET /api/diabetes-types/:id）。
 * 3.2.24 详情响应字段与列表一致，故直接取 DiabetesType。
 */
export type DiabetesTypeDetail = DiabetesType;
```

> 列表卡片的展示字段 `brief`（卡片简介）与 `color`（渐变叠层）由组件在模板中派生，不入类型：
> - `brief`：原型字段，后端不返回。卡片副文案**直接取 `pathogenesis` 截断 28 字 + '…'**（见 §2.2 `normalizeType` 已内联此逻辑；为保持 store 归一单一来源，组件读归一后的 `diabetesTypes`，`brief` 由 store 计算并挂在返回对象上）。
> - `color`：按 `id` 哈希选 4 组主色渐变（见 §4.3 E 与 §7.2 `typeGradient`），不依赖后端 `color` 字段。
>
> 为承载归一后的 `brief`/`cover` 展示字段而不污染 `DiabetesType` 类型，store 内部用**展示视图类型**（不入 `api.ts`）：

```ts
// 仅在 homeStore.ts 内部使用，不入 src/types/api.ts
interface DiabetesTypeView extends DiabetesType {
  /** 归一后的封面（image || '' → 组件判空走渐变） */
  cover: string;
  /** 归一后的卡片简介（pathogenesis 截断 28 字兜底，空则 ''） */
  brief: string;
}
```

> 组件 `computed` 返回 `DiabetesTypeView[]`，模板读 `t.cover` / `t.brief`。弹层 `showDiabetesType(t)` 用 `DiabetesType` 字段（`pathogenesis`/`manifestation`/`treatment`/`name`）——这些在 `DiabetesTypeView` 上同样存在（extends）。

### 1.4 字段默认常量（在 `homeStore.ts` 顶部集中声明）

```ts
const FALLBACK_ARTICLE_COVER = '/static/images/placeholder-article.svg' // 无封面占位；静态资源缺失时 img onerror 回退 CSS 渐变
const FALLBACK_DOCTOR_AVATAR = '/static/images/placeholder-doctor.svg'  // 无医生头像占位
const FALLBACK_DIABETES_COVER = '' // 空 → 组件改用主色渐变叠层（prototype 原即渐变为主）
```

> Coder 注：占位图资源可能尚不存在；组件对 `img` 加 `onerror` 回退到 CSS 渐变背景，不依赖文件存在。

---

## 2. homeStore 接口（新增 `src/stores/homeStore.ts`，setup-store 风格）

### 2.1 State / Action 完整签名 — 修正 M6（删除悬空 `initialized`）

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Doctor, Article, DiabetesType, DiabetesTypeDetail } from '@/types/api'
import { getDoctors, getArticles, getDiabetesTypes, getDiabetesType } from '@/composables/useHomeApi'

// 仅 store 内部使用的展示视图类型（不入 api.ts，避免污染对外契约类型）
interface DiabetesTypeView extends DiabetesType {
  cover: string
  brief: string
}

const FALLBACK_ARTICLE_COVER = '/static/images/placeholder-article.svg'
const FALLBACK_DOCTOR_AVATAR = '/static/images/placeholder-doctor.svg'
const FALLBACK_DIABETES_COVER = ''

export const useHomeStore = defineStore('home', () => {
  // ===== state =====
  const doctors = ref<Doctor[]>([])
  const articles = ref<Article[]>([])
  const diabetesTypes = ref<DiabetesTypeView[]>([])

  /** 全局加载态（三接口至少一个 pending 为 true） */
  const loading = ref<boolean>(false)
  /** 分区块错误，支持独立降级 */
  const doctorsError = ref<Error | null>(null)
  const articlesError = ref<Error | null>(null)
  const typesError = ref<Error | null>(null)
  /** 弹层详情按需拉取 */
  const detailLoading = ref<boolean>(false)
  const detailError = ref<Error | null>(null)

  // 注：原 initialized 字段已删除（修正 M6）。首页每次 onMounted 即拉取最新数据，
  //     逻辑最简且符合 prototype 体验，无需 gate。

  // ===== actions =====

  /**
   * 并行拉取三个公开接口；任一失败不阻断其余区块。
   * 用 Promise.allSettled，按 result.status 回填数据/错误。
   */
  async function fetchHomeData(): Promise<void> {
    loading.value = true
    doctorsError.value = null
    articlesError.value = null
    typesError.value = null

    const [docRes, artRes, typeRes] = await Promise.allSettled([
      getDoctors({ page: 1, pageSize: 20 }),
      getArticles({ page: 1, pageSize: 3 }),   // 首页仅取前 3 条
      getDiabetesTypes(),
    ])

    if (docRes.status === 'fulfilled') doctors.value = docRes.value
    else doctorsError.value = docRes.reason instanceof Error ? docRes.reason : new Error('医师列表加载失败')
    if (artRes.status === 'fulfilled') articles.value = artRes.value
    else articlesError.value = artRes.reason instanceof Error ? artRes.reason : new Error('科普文章加载失败')
    if (typeRes.status === 'fulfilled') diabetesTypes.value = normalizeTypes(typeRes.value)
    else typesError.value = typeRes.reason instanceof Error ? typeRes.reason : new Error('糖尿病类型加载失败')

    loading.value = false
  }

  /**
   * 弹层按需拉取单个类型详情；失败回退列表项已有数据。
   * id 为后端 number 主键（修正 M1）。
   */
  async function fetchDiabetesTypeDetail(id: number): Promise<DiabetesTypeDetail | null> {
    detailLoading.value = true
    detailError.value = null
    try {
      return await getDiabetesType(id)
    } catch (e) {
      detailError.value = e instanceof Error ? e : new Error('类型详情加载失败')
      // 回退：从已缓存列表中找（id 为 number，直接比较）
      const cached = diabetesTypes.value.find(t => t.id === id)
      return cached ?? null
    } finally {
      detailLoading.value = false
    }
  }

  /** 重试单个区块 */
  async function retryDoctors(): Promise<void> { await fetchSingle('doctors') }
  async function retryArticles(): Promise<void> { await fetchSingle('articles') }
  async function retryTypes(): Promise<void> { await fetchSingle('types') }

  async function fetchSingle(which: 'doctors' | 'articles' | 'types'): Promise<void> {
    if (which === 'doctors') {
      doctorsError.value = null
      try { doctors.value = await getDoctors({ page: 1, pageSize: 20 }) }
      catch (e) { doctorsError.value = e instanceof Error ? e : new Error('医师列表加载失败') }
      return
    }
    if (which === 'articles') {
      articlesError.value = null
      try { articles.value = await getArticles({ page: 1, pageSize: 3 }) }
      catch (e) { articlesError.value = e instanceof Error ? e : new Error('科普文章加载失败') }
      return
    }
    typesError.value = null
    try { diabetesTypes.value = normalizeTypes(await getDiabetesTypes()) }
    catch (e) { typesError.value = e instanceof Error ? e : new Error('糖尿病类型加载失败') }
  }

  // ===== 内部归一（纯函数，组件只读归一化后的 diabetesTypes） =====
  /** 将后端 image 归一为展示 cover；brief 由 pathogenesis 截断 28 字兜底 */
  function normalizeType(t: DiabetesType): DiabetesTypeView {
    const cover = (t.image ?? '') || FALLBACK_DIABETES_COVER
    const brief = t.pathogenesis ? (t.pathogenesis.length > 28 ? t.pathogenesis.slice(0, 28) + '…' : t.pathogenesis) : ''
    return { ...t, cover, brief }
  }
  function normalizeTypes(list: DiabetesType[]): DiabetesTypeView[] { return list.map(normalizeType) }

  return {
    // state
    doctors, articles, diabetesTypes,
    loading, doctorsError, articlesError, typesError,
    detailLoading, detailError,
    // actions
    fetchHomeData, fetchDiabetesTypeDetail,
    retryDoctors, retryArticles, retryTypes,
  }
})
```

> 约束：store 内不读 `localStorage.token`，JWT 由 `useApi.ts` axios 拦截器注入。禁用 `any`，错误对象统一为 `Error`。`normalizeType` 为纯函数。`fetchDiabetesTypeDetail` 入参 `id: number`（对齐后端主键类型，修正 M1）。`FALLBACK_*` 常量集中顶部，供组件复用（组件内如需可从 store 暴露或在本文件再声明；本设计选择组件内自带同名常量以避免 store 暴露常量污染接口，二选一保持一致即可，推荐 store 不暴露、组件自带）。

---

## 3. useHomeApi 接口（新增 `src/composables/useHomeApi.ts`）— 修正 C1 / M3

```ts
import { api } from '@/composables/useApi'
import type {
  Doctor, Article, DiabetesType, DiabetesTypeDetail,
  PaginationParams, PaginationInfo,
} from '@/types/api'

/**
 * 分页端点的 HTTP body 类型。
 * 依据 docs/2_detailed_design_v3.md 3.2.9 / 3.2.19：body = { success, data: T[], pagination }，
 * pagination 与 data 平级在最外层（即 body 本身），不是 ApiResponse<PaginatedResponse<T>>。
 * 此类型即 PaginatedResponse<T> & { success: boolean; message?: string } 的内联等价。
 */
interface PagedBody<T> {
  success: boolean
  data: T[]
  pagination: PaginationInfo
  message?: string
}

/** 医生列表分页参数（page/pageSize 均可选，缺省走后端默认） */
type DoctorsParams = Partial<PaginationParams>

/** 文章列表参数：分类筛选 + 分页 */
interface ArticlesParams extends Partial<PaginationParams> {
  category?: string
}

/**
 * GET /api/doctors（分页）
 * 解包：res.data 是 body（PagedBody<Doctor>），数组 = res.data.data，分页 = res.data.pagination。
 * 返回 Doctor[]。
 */
export async function getDoctors(params: DoctorsParams = {}): Promise<Doctor[]> {
  const res = await api.get<PagedBody<Doctor>>('/doctors', { params })
  return res.data.data
}

/**
 * GET /api/articles（分页 + 分类筛选）
 * 解包：res.data.data 是 Article[]；返回 Article[]。
 */
export async function getArticles(params: ArticlesParams = {}): Promise<Article[]> {
  const res = await api.get<PagedBody<Article>>('/articles', { params })
  return res.data.data
}

/**
 * GET /api/diabetes-types（非分页，数组直返）
 * 依据 3.2.24 / 3.8.3：body = { success, data: DiabetesType[] }（无 pagination）。
 * 修正 M3：按权威契约单一解包路径 res.data.data，不做过度兼容分支。
 * 返回 DiabetesType[]。
 */
export async function getDiabetesTypes(): Promise<DiabetesType[]> {
  const res = await api.get<{ success: boolean; data: DiabetesType[]; message?: string }>('/diabetes-types')
  return res.data.data
}

/**
 * GET /api/diabetes-types/:id（单对象，详情字段与列表一致）
 * 解包：res.data.data 是 DiabetesType；返回 DiabetesTypeDetail。
 * id 为后端 number 主键。
 */
export async function getDiabetesType(id: number): Promise<DiabetesTypeDetail> {
  const res = await api.get<{ success: boolean; data: DiabetesType; message?: string }>(`/diabetes-types/${encodeURIComponent(id)}`)
  return res.data.data
}
```

> 说明（修正 C1）：分页端点泛型用内联 `PagedBody<T>`（= body 形态），不套 `ApiResponse<PaginatedResponse<T>>`；数组解包统一 `res.data.data`，分页解包 `res.data.pagination`。这与 `Risk.vue` 第 282 行 `api.get<{ success: boolean; data: RiskHistoryItem[]; pagination: unknown }>('/risk/history')` 的范式完全一致。
> 修正 M3：`getDiabetesTypes` 按 3.2.24 已确认非分页，单一解包 `res.data.data`，移除原双重 `Array.isArray` 兼容分支与 `as unknown as` 断言。
> 修正 M1：`getDiabetesType(id: number)` 入参为 `number`，对齐后端主键。禁 `any`。

---

## 4. Home.vue 组件结构

### 4.1 子组件抽取策略
**全部内联**于 `Home.vue`，不抽 `src/components/home/`。理由：prototype 首页即单模板内联、区块间共享轮播定时器与 store 引用、避免目录扩张；区块数量适中（4 个）。

### 4.2 `<script setup lang="ts">` 顶层结构 — 修正 M4 / M5 / M7 / M8

```ts
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import DOMPurify from 'dompurify'
import Swal from 'sweetalert2'
import { useHomeStore } from '@/stores/homeStore'
// 修正 M8：补 Article 导入（articleCover/articleViews/articleSummary 命名依赖）
import type { Article, DiabetesType, DiabetesTypeDetail } from '@/types/api'

const router = useRouter()
const homeStore = useHomeStore()

// 占位常量（与 store 内同名常量保持一致值；store 不暴露常量，故组件自带）
const FALLBACK_ARTICLE_COVER = '/static/images/placeholder-article.svg'
const FALLBACK_DOCTOR_AVATAR = '/static/images/placeholder-doctor.svg'

// ===== 轮播 Banner（复刻 prototype banners 3 条） =====
// 注：gradient 改为 CSS 渐变字符串（scoped 类名引用），不再用 Tailwind 工具类
interface Banner { id: number; title: string; subtitle: string; gradientClass: string; icon: string }
const banners: Banner[] = [
  { id: 1, title: '科学控糖 · 智慧生活', subtitle: '个性化方案，从今天开始', gradientClass: 'banner-grad-1', icon: 'fa-heart-pulse' },
  { id: 2, title: 'AI 医师 7×24 在线', subtitle: '专业咨询，触手可及', gradientClass: 'banner-grad-2', icon: 'fa-user-doctor' },
  { id: 3, title: '每日打卡 · 健康相伴', subtitle: '记录每一份坚持', gradientClass: 'banner-grad-3', icon: 'fa-calendar-check' },
]
const current = ref(0)
let bannerTimer: ReturnType<typeof setInterval> | null = null
function nextBanner() { current.value = (current.value + 1) % banners.length }
function startAuto() { stopAuto(); bannerTimer = setInterval(nextBanner, 4000) }
function stopAuto() { if (bannerTimer) { clearInterval(bannerTimer); bannerTimer = null } }

// ===== 派生展示数据 =====
const doctors = computed(() => homeStore.doctors)
const articles = computed(() => homeStore.articles.slice(0, 3)) // 取前 3 条（store 已取 3，二次保险）
const diabetesTypes = computed(() => homeStore.diabetesTypes)

// 阅读量/封面展示助手（修正 M2：直接取契约字段，无 read_count 兜底）
const articleCover = (a: Article): string => a.cover || FALLBACK_ARTICLE_COVER
const articleViews = (a: Article): number => a.views
const articleSummary = (a: Article): string => a.summary

// ===== 跳转 — 修正 M7：goDoctor 不带 id 入参 =====
function goDoctor() {
  // Consultation 页是否接受 ?doc=id query 未确认（见 §8）；本任务仅跳 tab，不带 query，不臆造对话页
  router.push('/consultation')
}
function goArticle(_id: number) {
  // 文章详情页（/news/article/:id）不在本任务；仅跳资讯 tab
  router.push('/news')
}
function goNewsList() { router.push('/news') }
function onSearch() {
  // prototype 仅占位；弹 Swal 提示开发中
  Swal.fire({ toast: true, position: 'top', icon: 'info', title: '搜索功能开发中', showConfirmButton: false, timer: 1800, timerProgressBar: true })
}

// ===== 糖尿病类型弹层（SweetAlert2 + DOMPurify）— 修正 M4 / M5 =====
// 统一方案：含 HTML 拼接 → DOMPurify.sanitize 一次后以 html 传入 Swal（见 §5）。
// 后端三段文本（pathogenesis/manifestation/treatment）按 3.2.24 示例为纯文本，
// DOMPurify 作为防御性兜底单次净化即可，不双重净化。
// 弹层定调（修正 M4）：先 await 详情再单次弹（消除"先弹后补再重弹"闪烁）。
//   列表项已含 pathogenesis/manifestation/treatment（3.2.24 列表与详情字段一致），
//   故实际上列表数据即可完整展示，但为对齐"详情接口存在"语义，仍调一次 fetchDiabetesTypeDetail：
//   成功用详情，失败回退列表项（store 已处理回退）。单次 Swal.fire，不重弹、不 update。
async function showDiabetesType(t: DiabetesType): Promise<void> {
  // 列表项已含完整三段文本；按需拉详情（接口存在），失败回退列表项数据
  const detail = await homeStore.fetchDiabetesTypeDetail(t.id)
  const data: DiabetesTypeDetail = detail ?? t
  openTypeSwal(data)
}

function openTypeSwal(t: DiabetesTypeDetail): void {
  // buildSection：纯文本段（契约 3.2.24 示例为纯文本）拼成带标签的 HTML 结构。
  // DOMPurify 在最终 html 整体净化一次（修正 M5：不双重净化）。
  const buildSection = (label: string, body?: string): string =>
    body
      ? `<h4 class="dt-modal-h">${label}</h4><p class="dt-modal-p">${escapeHtml(body)}</p>`
      : ''
  const html = DOMPurify.sanitize(
    `<div class="dt-modal">
       ${buildSection('病因', t.pathogenesis)}
       ${buildSection('临床表现', t.manifestation)}
       ${buildSection('治疗方式', t.treatment)}
     </div>`
  )
  Swal.fire({
    title: t.name || '糖尿病类型',
    html,
    confirmButtonText: '了解了',
    width: 340,
  })
}

// 纯文本转义（字段为纯文本时防止用户/后端文本里含 < > & 破坏 HTML 结构；与 DOMPurify 双保险但无双重净化语义）
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ===== 区块重试（供降级 UI 调用） =====
function retryDoctors() { homeStore.retryDoctors() }
function retryArticles() { homeStore.retryArticles() }
function retryTypes() { homeStore.retryTypes() }

// ===== 生命周期 =====
onMounted(() => {
  startAuto()
  homeStore.fetchHomeData()   // fire-and-forget；store 内部管 loading/error
})
onUnmounted(() => { stopAuto() })
```

> 修正说明：
> - **M4**：弹层定调为「先 `await fetchDiabetesTypeDetail` 再单次 `Swal.fire`」。因 3.2.24 列表已含完整三段文本，详情接口实际冗余但保留以对齐"详情接口存在"语义；失败由 store 回退列表项。**不再先弹后补再重弹**，无闪烁、无双弹窗。
> - **M5**：弹层统一用「含 HTML → `DOMPurify.sanitize` 一次 + `html`」方案（见 §5）。三段文本按契约为纯文本，`escapeHtml` 转义后拼入结构，DOMPurify 对最终 html 整体净化**一次**（不双重）。Swal 弹窗标题/按钮为纯文本走 Swal 默认。后端若返回 Markdown 需升级 marked——列为 §8 显式未决，本任务不实现。
> - **M7**：`goDoctor()` 无入参，模板 `@click="goDoctor"`（不传 `doc.id`）。
> - **M8**：`import type { Article, DiabetesType, DiabetesTypeDetail }` 齐全，`articleCover(a: Article)` 等命名可解析。

### 4.3 Template 四区块 DOM 层级与类名方案 — 修正 C2（全部 scoped CSS 自定义语义类，无 Tailwind）

复刻 prototype 408-523 行视觉，但**全部使用自定义语义类名**（非 Tailwind 工具类），样式在 `<style scoped>` 中定义（见 §7）。主容器 `<div class="home-page page-enter">`，`padding-bottom` 留出底部 tab 栏（`var(--tab-bar-height)` = 64px）空间。

> 移动端基准宽度（修正 C2 §7.2 误称）：`src/App.vue` 根节点是 `.app-root`，**无 `max-w-md mx-auto` 包裹**（亦无 Tailwind）。Home 自行控制移动端基准宽度与居中：`.home-page { max-width: 480px; margin: 0 auto; }`（贴合原型移动端宽度，不溢出；375px 设备自然撑满，>480px 屏居中）。底部 tab 栏在 App.vue 已 `fixed`，Home 只需 `padding-bottom: calc(var(--tab-bar-height) + 8px)` 避免遮挡。

**A. 顶部 Header（sticky）**
```
header.home-header
  div.home-header-left
    div.home-logo > i.fa-solid.fa-heart-pulse
    div
      h1.home-title "糖尿病预治智能助手"
      p.home-subtitle "科学控糖 · 智慧生活"
  button.home-search-btn[aria-label="搜索"] @click="onSearch" > i.fa-solid.fa-magnifying-glass
```

**B. 轮播 Banner**
```
div.home-banner-wrap
  div.banner-frame[@click="nextBanner"]
    div(v-for="(b,i) in banners" v-show="current===i" :class="['banner-slide','banner-glow',b.gradientClass]")
      div.banner-text
        h2.banner-title {{b.title}}
        p.banner-subtitle {{b.subtitle}}
        button.banner-cta "立即了解 →"
      i.fa-solid(:class="b.icon").banner-icon
    div.banner-dots
      span(v-for="(b,i) in banners" @click.stop="current=i" :class="['swiper-dot', current===i ? 'active' : '']")
```

**C. 专业医师团队（横向滚卡片）**
```
section.home-section
  div.section-head
    h2.section-title "专业医师团队"
    button.section-link[@click="goDoctor"] "查看全部" + i.fa-solid.fa-chevron-right
  -- 错误态：v-if="homeStore.doctorsError" → .block-empty + 重试按钮（见 §6）
  -- 加载态：v-else-if="homeStore.loading && !doctors.length" → .doctor-skeleton × 3
  -- 正常态：v-else .doctor-scroll
       div.doctor-card(v-for="doc in doctors" @click="goDoctor")
         div.doctor-avatar-wrap
           div.avatar-ring > img.doctor-avatar :src="doc.avatar || FALLBACK_DOCTOR_AVATAR" :alt="doc.name" @error="onAvatarError"
           -- 注：不渲染在线点（后端 Doctor 无 online 字段，修正 §8 容错：不渲染，见 M5/§8-5）
         p.doctor-name {{doc.name}}
         p.doctor-dept {{doc.department}}
         span.doctor-title {{doc.title}}
```

> 在线点 `online`：后端 `Doctor` 类型无此字段（3.8.3 确认）。本任务**不渲染在线点**（避免误导），原型 mock 的 `online` 不进入真实数据流。见 §8-5 已决项。`onAvatarError` 见 §7.3。

**D. 健康科普**
```
section.home-section
  div.section-head
    h2.section-title "健康科普"
    button.section-link[@click="goNewsList"] "更多" + i.fa-solid.fa-chevron-right
  -- 区块降级/加载态同 §6
  div.article-list
    article.article-card(v-for="a in articles" @click="goArticle(a.id)")
      img.article-cover :src="articleCover(a)" :alt="a.title" @error="onCoverError"
      div.article-body
        span.article-category {{a.category}}
        h3.article-title {{a.title}}
        p.article-summary(v-if="articleSummary(a)") {{articleSummary(a)}}
        div.article-meta
          span > i.fa-regular.fa-eye + {{articleViews(a)}}
```

> 注：prototype 还显示 `likes`（点赞），但后端 `Article` 契约无 `likes` 字段，本任务不臆造，仅展示阅读量 `views`（修正 M2 字段收窄）。

**E. 糖尿病类型（2 列网格）**
```
section.home-section
  div.section-head
    h2.section-title "糖尿病类型"
    span.section-link-static "全部" + i.fa-solid.fa-chevron-right  -- 原型为 span 非按钮，保持不可点
  -- 区块降级/加载态同 §6
  div.type-grid
    article.type-card(v-for="t in diabetesTypes" @click="showDiabetesType(t)")
      div.type-cover-wrap(:class="typeGradientClass(t.id)")
        img.type-cover(v-if="t.cover" :src="t.cover" :alt="t.name" @error="onTypeCoverError(t)")
        -- v-if 无图则不渲染 img，渐变叠层（.type-cover-wrap 背景渐变）直接显示
        div.type-cover-overlay
        h3.type-name {{t.name}}
      div.type-brief-wrap
        p.type-brief {{t.brief}}
```

> `typeGradientClass(id: number): string`：按 `id` 选 4 组主色渐变 scoped 类（与原型 mock 4 色一致）：
> - `id % 4 === 1` → `.type-grad-1`（blue→indigo）
> - `id % 4 === 2` → `.type-grad-2`（sky→cyan）
> - `id % 4 === 3` → `.type-grad-3`（pink→rose）
> - `id % 4 === 0` → `.type-grad-4`（violet→purple）
>
> 渐变叠层 `.type-cover-overlay` 用 `linear-gradient(to top, rgba(0,0,0,.55), transparent)` 使白字标题可读（对齐 prototype `bg-gradient-to-t opacity-90`）。无图时 `.type-cover-wrap` 自身背景即渐变（见 §7.2）。

---

## 5. 跳转策略

| 元素 | 点击行为 | 目标路由 | 备注 |
|---|---|---|---|
| 顶部搜索按钮 | `Swal` toast「搜索功能开发中」 | 无跳转 | 对齐 prototype 占位 |
| Banner 卡片/立即了解 | `nextBanner()`（切下一张） | 无跳转 | prototype 原行为 |
| Banner 圆点 | `current=i` 切换 | 无跳转 | |
| 医生卡「查看全部」 | `router.push('/consultation')` | `/consultation` | consultation tab |
| 医师卡 | `goDoctor()` → `router.push('/consultation')` | `/consultation` | **不带 `?doc=id`**（修正 M7：函数无入参，模板不传 id） |
| 健康科普「更多」 | `router.push('/news')` | `/news` | |
| 文章卡 | `router.push('/news')` | `/news` | 文章详情页不在本任务，仅跳资讯 tab |
| 糖尿病类型卡 | `showDiabetesType(t)` 弹层 | 无路由跳转 | **SweetAlert2 弹层**展示病因/表现/治疗（不臆造 `/diabetes-type/:id` 路由，router 表禁止改） |
| 糖尿病类型「全部」 | 仅展示文案，无跳转 | 无 | prototype 原为 `<span>` 非按钮；保持非可点 |

### 糖尿病类型弹层方案细节（SweetAlert2 + DOMPurify）— 修正 M4 / M5，统一方案定调

弹层目标：展示 `name + 病因(pathogenesis) + 表现(manifestation) + 治疗(treatment)`。

**统一净化方案（二选一已定调）**：采用「含 HTML → `DOMPurify.sanitize` + `html`」方案。
- 后端三段文本按 3.2.24 示例为**纯文本**（`"1型糖尿病是一种自身免疫性疾病..."`，无 HTML/Markdown 标记）。
- 组件将三段纯文本经 `escapeHtml` 转义后拼成带 `<h4>/<p>` 标签的 HTML 结构（`<div class="dt-modal">…</div>`），最终对整体 html 调 `DOMPurify.sanitize` **一次**后传入 `Swal.fire({ html })`。
- **不双重净化**：`buildSection` 内部不调 `DOMPurify`，只在最外层 `html` 拼装后净化一次（修正 M5）。`escapeHtml` 处理纯文本中可能的 `<>&`，DOMPurify 兜底防御。
- 缺失字段：`buildSection` 在 body 为空时返回空串，对应段省略，不显示空标题。
- `title` 展示 `t.name`；`confirmButtonText: '了解了'`；`width: 340` 适配移动端。
- 弹窗内 `<h4>/<p>` 样式由 `Swal.fire` 的 `customClass` 注入（见 §7.2 `.dt-modal-h/.dt-modal-p`，通过 `customClass: { html: 'dt-modal-container' }` 或直接在 html 内联 style 兜底；推荐 customClass + scoped `:deep()`，见 §7.2 注）。

**弹层时序定调（修正 M4）**：`showDiabetesType` 先 `await homeStore.fetchDiabetesTypeDetail(t.id)`，成功用详情、失败回退列表项 `t`（store 已处理回退返回 `null` 时组件用 `?? t`），**单次** `openTypeSwal` 弹出。消除原「先弹后补再重弹」的闪烁与双弹窗。

> 为什么不引入 marked：task_v1.md 第 2 节「不引入新依赖；首页科普为列表摘要，无 Markdown 正文渲染需求」；类型文本是 Dify 生成的科普段，按纯文本净化即可。若后端实际为 Markdown，列为 §8 显式未决，本任务不实现。

---

## 6. 降级 / 空态 / 加载态（按区块）

设计原则（对齐 7.3 健康性降级）：`Promise.allSettled` 保证三区块独立降级；首页级采用骨架屏减少抖动；错误态内嵌文案 + 重试按钮，不阻断其他区块。

| 区块 | 加载态 | 空态（成功但 length=0） | 错误态（reject） |
|---|---|---|---|
| 医师团队 | 3 个 `.doctor-skeleton`（圆头像灰条 + 两行文字灰条，pulse 动画） | `.block-empty`「暂无可咨询医师」+ 重试按钮 `retryDoctors()` | `.block-empty`「医师列表加载失败」+ 重试按钮 `retryDoctors()` |
| 健康科普 | 3 条 `.article-skeleton`（80×80 灰块 + 2 行灰条） | `.block-empty`「暂无科普文章」+ 重试 `retryArticles()` | `.block-empty`「科普文章加载失败」+ 重试 `retryArticles()` |
| 糖尿病类型 | 2×2 网格 `.type-skeleton`（h-80 灰块 + 1 行灰条） | `.block-empty`「暂无糖尿病类型科普」+ 重试 `retryTypes()` | `.block-empty`「糖尿病类型加载失败」+ 重试 `retryTypes()` |
| Banner | 不走接口（静态），无加载态 | — | — |
| 弹层详情失败 | `detailLoading` 不阻塞弹层（列表项已有完整三段文本，直接弹列表数据） | — | 弹层回退列表项数据（store 返回 null → 组件用 `?? t`），仍正常展示 |

骨架屏实现：scoped CSS `.doctor-skeleton/.article-skeleton/.type-skeleton` 用 `var(--color-divider)` 灰底 + `@keyframes skeleton-pulse` 透明度脉动，不引入第三方。错误/空态：`.block-empty { padding: 32px 0; text-align: center; }`，文案 `.block-empty-text { font-size: 13px; color: var(--color-text-secondary); }`，重试按钮 `.retry-btn { color: var(--color-primary); font-size: 12px; text-decoration: underline; }`。

---

## 7. 样式细节（scoped CSS + CSS 变量）— 修正 C2，完全去除 Tailwind

> 修正 C2：项目**未安装 Tailwind**（package.json 无 tailwindcss、无 postcss/autoprefixer；vite.config.ts 无 @tailwindcss/vite；无 tailwind.config.*）。Home.vue 全部样式用 `<style scoped>` 自定义语义类 + `src/assets/variables.css` 的 CSS 变量（`--color-primary` 等），参照 `Risk.vue` 的 `.risk-container/.top-bar/.btn-primary` 自定义类风格。**不引入任何 Tailwind 工具类、不引入新依赖。**
>
> 修正 §7.2 误称：`src/App.vue` 根节点 `.app-root` **无 `max-w-md mx-auto` 包裹**。Home 自行控制移动端基准宽度与居中。

### 7.1 主色 / 字号映射（CSS 变量，对齐 variables.css 与 7.1 设计系统）

| 用途 | 变量/值 | 来源 |
|---|---|---|
| 主色 | `var(--color-primary)` = `#4A90D9` | variables.css |
| 主色浅（标签底） | `var(--color-primary-light)` = `#E8F1FB` | variables.css |
| 主色深（hover/active） | `var(--color-primary-dark)` = `#3A7BC8` | variables.css |
| 正文主色 | `var(--color-text-primary)` = `#333` | variables.css |
| 次要文字 | `var(--color-text-secondary)` = `#666` | variables.css |
| 卡片底 | `var(--color-card)` = `#FFFFFF` | variables.css |
| 页面背景 | `var(--color-bg)` = `#F5F5F5` | variables.css |
| 分割线/灰条 | `var(--color-divider)` = `#E8E8E8` | variables.css |
| 卡片阴影 | `var(--shadow-sm)` / `var(--shadow-md)` | variables.css |
| 圆角 | `var(--radius-md)`=8px / `var(--radius-lg)`=12px / `var(--radius-full)` | variables.css |
| 间距 | `var(--spacing-xs/sm/md/lg/xl/2xl)` = 4/8/12/16/20/24px | variables.css |
| tab 栏高 | `var(--tab-bar-height)` = 64px | variables.css |

字号层级（与 prototype 一致，硬编码 px 因 variables.css 字号变量粒度不够细）：
- 首页 header h1：16px（对齐 prototype `text-base`）
- 副标题：10px（prototype `text-[10px]`）
- 区块标题 H2：16px bold
- 卡片标题：14px bold
- 辅助文字：11px / 10px

### 7.2 关键 `<style scoped>` 完整定义（可直接落地）

```css
<style scoped>
/* ============ 移动端容器（修正 C2 §7.2） ============ */
.home-page {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  padding-bottom: calc(var(--tab-bar-height) + 8px);
  background: var(--color-bg);
  position: relative;
}

/* ============ page-enter 入场动画 ============ */
.page-enter { animation: pageEnter 0.3s ease; }
@keyframes pageEnter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
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
.home-header-left { display: flex; align-items: center; gap: var(--spacing-sm); }
.home-logo {
  width: 36px; height: 36px;
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
  border-radius: var(--radius-lg);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 16px;
}
.home-title { font-size: 16px; font-weight: 700; color: var(--color-text-primary); line-height: 1.25; }
.home-subtitle { font-size: 10px; color: #94a3b8; }
.home-search-btn {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  color: #64748b; background: transparent; border: none; cursor: pointer;
  transition: opacity var(--transition-fast);
}
.home-search-btn:active { opacity: 0.6; }

/* ============ 区块通用 ============ */
.home-section { padding: 0 var(--spacing-lg); margin-top: 20px; }
.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-md); }
.section-title { font-size: 16px; font-weight: 700; color: var(--color-text-primary); }
.section-link {
  font-size: 12px; color: var(--color-primary); display: flex; align-items: center;
  background: transparent; border: none; cursor: pointer;
  transition: opacity var(--transition-fast);
}
.section-link:active { opacity: 0.6; }
.section-link i { margin-left: 4px; font-size: 10px; }
.section-link-static { font-size: 12px; color: var(--color-primary); display: flex; align-items: center; }
.section-link-static i { margin-left: 4px; font-size: 10px; }

/* ============ B. Banner ============ */
.home-banner-wrap { padding: 0 var(--spacing-lg); margin-top: var(--spacing-md); }
.banner-frame {
  position: relative; border-radius: 16px; overflow: hidden;
  height: 144px; box-shadow: 0 4px 14px rgba(0,0,0,0.06); cursor: pointer;
}
.banner-slide {
  position: absolute; inset: 0;
  display: flex; align-items: center; padding: 0 24px; color: #fff;
  transition: opacity 0.5s ease;
}
/* 3 组渐变（对齐 prototype banners） */
.banner-grad-1 { background: linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #0ea5e9 100%); }
.banner-grad-2 { background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 50%, #06b6d4 100%); }
.banner-grad-3 { background: linear-gradient(135deg, #06b6d4 0%, #0ea5e9 50%, #3b82f6 100%); }
.banner-glow { position: relative; }
.banner-glow::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(circle at 80% 20%, rgba(255,255,255,0.25), transparent 60%);
  animation: bannerGlow 3s ease-in-out infinite alternate;
}
@keyframes bannerGlow { from { opacity: 0.4; } to { opacity: 0.9; } }
.banner-text { position: relative; z-index: 10; flex: 1; }
.banner-title { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
.banner-subtitle { font-size: 14px; color: rgba(255,255,255,0.8); margin-bottom: var(--spacing-md); }
.banner-cta {
  background: rgba(255,255,255,0.2); backdrop-filter: blur(4px);
  color: #fff; font-size: 12px; font-weight: 500;
  padding: 6px 16px; border-radius: var(--radius-full); border: none; cursor: pointer;
}
.banner-icon { position: relative; z-index: 10; font-size: 60px; color: rgba(255,255,255,0.2); }
.banner-dots {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 6px; z-index: 20;
}
.swiper-dot { height: 6px; width: 6px; border-radius: var(--radius-full); background: rgba(255,255,255,0.5); cursor: pointer; transition: width 0.3s ease, background 0.3s ease; }
.swiper-dot.active { width: 16px; background: rgba(255,255,255,0.95); }

/* ============ C. 医师团队 ============ */
.doctor-scroll {
  display: flex; gap: var(--spacing-md);
  overflow-x: auto; padding-bottom: var(--spacing-sm);
  margin: 0 calc(-1 * var(--spacing-lg)); padding-left: var(--spacing-lg); padding-right: var(--spacing-lg);
}
.doctor-scroll::-webkit-scrollbar { display: none; }
.doctor-scroll { -ms-overflow-style: none; scrollbar-width: none; }
.doctor-card {
  background: var(--color-card); border-radius: 16px; padding: var(--spacing-md);
  min-width: 140px; box-shadow: 0 4px 14px rgba(0,0,0,0.06);
  flex-shrink: 0; cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.doctor-card:active { transform: scale(0.97); box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
.doctor-avatar-wrap { position: relative; width: 64px; height: 64px; margin: 0 auto var(--spacing-sm); }
.avatar-ring {
  width: 100%; height: 100%; border-radius: var(--radius-full); padding: 2px;
  background: linear-gradient(135deg, #4A90D9, #38bdf8);
  box-shadow: 0 0 0 0 rgba(74,144,217,0.4);
  animation: avatarRing 2.4s ease-in-out infinite;
}
.avatar-ring > .doctor-avatar { width: 100%; height: 100%; border: 2px solid #fff; border-radius: var(--radius-full); object-fit: cover; background: #f1f5f9; }
@keyframes avatarRing {
  0%, 100% { box-shadow: 0 0 0 0 rgba(74,144,217,0.45); }
  50% { box-shadow: 0 0 0 6px rgba(74,144,217,0); }
}
.doctor-name { text-align: center; font-weight: 700; font-size: 14px; color: var(--color-text-primary); }
.doctor-dept { text-align: center; font-size: 11px; color: var(--color-text-secondary); margin-top: 2px; }
.doctor-title {
  display: block; text-align: center; font-size: 10px; color: var(--color-primary);
  background: var(--color-primary-light); padding: 2px var(--spacing-sm);
  border-radius: var(--radius-full); margin-top: 6px;
}

/* ============ D. 健康科普 ============ */
.article-list { display: flex; flex-direction: column; gap: var(--spacing-md); }
.article-card {
  background: var(--color-card); border-radius: 16px; padding: var(--spacing-md);
  box-shadow: 0 4px 14px rgba(0,0,0,0.06); display: flex; gap: var(--spacing-md);
  cursor: pointer; transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.article-card:active { transform: scale(0.97); box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
.article-cover { width: 80px; height: 80px; border-radius: var(--radius-lg); object-fit: cover; flex-shrink: 0; background: var(--color-divider); }
.article-body { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
.article-category { font-size: 10px; color: var(--color-primary); background: var(--color-primary-light); padding: 2px var(--spacing-sm); border-radius: var(--radius-full); align-self: flex-start; }
.article-title {
  font-size: 14px; font-weight: 700; color: var(--color-text-primary); margin-top: 4px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.35;
}
.article-summary {
  font-size: 11px; color: #94a3b8; margin-top: 4px;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
}
.article-meta { display: flex; align-items: center; gap: var(--spacing-md); font-size: 11px; color: #94a3b8; }
.article-meta i { margin-right: 2px; }

/* ============ E. 糖尿病类型 ============ */
.type-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-md); }
.type-card {
  background: var(--color-card); border-radius: 16px; overflow: hidden;
  box-shadow: 0 4px 14px rgba(0,0,0,0.06); cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.type-card:active { transform: scale(0.97); box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
.type-cover-wrap { height: 80px; overflow: hidden; position: relative; }
/* 4 组渐变（对齐 prototype diabetesTypes color） */
.type-grad-1 { background: linear-gradient(135deg, #3b82f6, #6366f1); }
.type-grad-2 { background: linear-gradient(135deg, #0ea5e9, #06b6d4); }
.type-grad-3 { background: linear-gradient(135deg, #ec4899, #f43f5e); }
.type-grad-4 { background: linear-gradient(135deg, #8b5cf6, #a855f7); }
.type-cover { width: 100%; height: 100%; object-fit: cover; display: block; }
.type-cover-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.55), transparent); }
.type-name {
  position: absolute; bottom: var(--spacing-sm); left: var(--spacing-md);
  color: #fff; font-weight: 700; font-size: 14px; z-index: 2;
}
.type-brief-wrap { padding: 10px; }
.type-brief {
  font-size: 11px; color: var(--color-text-secondary); line-height: 1.6;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

/* ============ 骨架屏（pulse 动画） ============ */
.doctor-skeleton, .article-skeleton, .type-skeleton {
  background: var(--color-divider); border-radius: var(--radius-md);
  animation: skeletonPulse 1.4s ease-in-out infinite;
}
@keyframes skeletonPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.doctor-skeleton { min-width: 140px; height: 180px; }
.article-skeleton { height: 96px; }
.type-skeleton { height: 130px; }

/* ============ 空态/错误态 ============ */
.block-empty { padding: 32px 0; text-align: center; }
.block-empty-text { font-size: 13px; color: var(--color-text-secondary); margin-bottom: var(--spacing-sm); }
.retry-btn {
  color: var(--color-primary); font-size: 12px; text-decoration: underline;
  background: transparent; border: none; cursor: pointer;
}
</style>
```

> SweetAlert2 弹层内部样式（`.dt-modal-h/.dt-modal-p`）因 Swal 注入到 body 不受 scoped 作用域限制，需用 `:deep()` 或 `customClass` + 全局样式。本设计采用 `Swal.fire({ html, customClass: { container: 'dt-swal' } })` + 一段非 scoped 全局样式（写在 Home.vue `<style>` 非 scoped 块，或注入 variables.css）。**为不污染全局且不引入新依赖**，推荐在 `openTypeSwal` 内用**内联 style** 直接写在 `<h4>/<p>` 上（与现有 router/index.ts `showDisclaimer` 内联 style 范式一致）：

```ts
// openTypeSwal 中 buildSection 改用内联 style（不依赖 scoped/customClass，落地最稳）：
const buildSection = (label: string, body?: string): string =>
  body
    ? `<h4 style="color:#4A90D9;font-size:15px;margin:12px 0 4px;text-align:left">${label}</h4>` +
      `<p style="font-size:13px;line-height:1.6;color:#333;margin:0;text-align:left">${escapeHtml(body)}</p>`
    : ''
```

> 这样 §7.2 scoped 块不含 `.dt-modal-*`，弹层样式随 html 内联，与 `router/index.ts` 的 `showDisclaimer` html 内联风格一致，且无需 `:deep()` 或全局污染。DOMPurify 保留 `style` 属性白名单（默认允许 inline style），净化后内联 style 保留。

### 7.3 img onerror 回退（占位资源缺失兜底）

```ts
// Home.vue <script setup> 内
function onAvatarError(e: Event) { (e.target as HTMLImageElement).style.display = 'none' }
function onCoverError(e: Event) { (e.target as HTMLImageElement).style.display = 'none' }
function onTypeCoverError(t: DiabetesTypeView) {
  // 隐藏 img，露出 .type-cover-wrap 渐变背景（v-if 已控制，但 onerror 触发时手动隐藏）
  // 因 v-if="t.cover" 已渲染 img，onerror 时设 display:none 露出渐变叠层
}
```

> `onTypeCoverError` 实际可通过模板 `@error="(e) => (e.target as HTMLImageElement).style.display='none'"` 内联，无需单独函数；或统一 `onCoverError`。Coder 二选一保持一致。占位图 SVG 若不存在，`onerror` 隐藏 img 后卡片仍显示灰底（`.article-cover/.doctor-avatar` 有 `background: var(--color-divider)`）。

---

## 8. 未决问题清单（交回 Planner / Coder 与后端确认；并标注容错）

> R2 修订：原 9 项中误列「diabetes-types 是否分页」（已决，移除，见 #1）、「tailwind primary」（已决且 C2 已证 Tailwind 未安装，移除，见 #9）。新增/明确若干。

| # | 未决点 | 影响范围 | 容错策略 / 已决结论 |
|---|---|---|---|
| 1 | ~~`/api/diabetes-types` 是否分页~~ | `getDiabetesTypes` 解包 | **已决（修正 M3）**：3.2.24 明确非分页数组直返，`getDiabetesTypes` 单一解包 `res.data.data`，无兼容分支。 |
| 2 | 文章 `summary` 字段后端是否稳定返回 | 文章卡副文案 | 契约 3.8.3 已列为必填、3.2.19 v13 修订稳定返回。类型 `summary: string`（必填）。展示 `v-if="articleSummary(a)"` 隐藏空串副文案行，不臆造。 |
| 3 | ~~文章字段名 `read_count` vs `views`、`publish_time` vs `created_at`~~ | 阅读量/时间展示 | **已决（修正 M2）**：3.2.19 注释明确为语义映射（非双字段并存），类型只保留 `views`/`created_at`，展示直接 `a.views`，首页不展示时间。 |
| 4 | 糖尿病类型展示字段 `brief`/`cover` 后端不返回 | 类型卡封面/简介 | `normalizeType` 归一：`cover = image ?? ''`（空走渐变叠层）；`brief = pathogenesis 截断 28 字`。原型 `color` 由 `typeGradientClass(id)` 按 id 选 4 组渐变。不依赖后端。 |
| 5 | 医师 `online` 字段后端是否提供 | 医师卡在线点 | **已决**：3.8.3 `Doctor` 无 `online` 字段。本任务**不渲染在线点**（避免误导），原型 mock 的 `online` 不进入真实数据流。如后端后续补充再恢复。 |
| 6 | `/consultation` 是否接受 `?doc=id` query 跳医生对话 | 医师卡跳转 | 本任务医师卡统一 `router.push('/consultation')` **不带 query**（修正 M7：`goDoctor()` 无入参）。待 Consultation 页落地后由那轮任务接收 query。 |
| 7 | 文章详情页 `/news/article/:id` 是否已落地 | 文章卡跳转 | 文章卡统一跳 `/news` tab，待 NewsView 详情路由确认后切换。本任务不新增路由（router 表禁止改）。 |
| 8 | 糖尿病类型弹层文本是否为 Markdown | 弹层净化方式 | **本任务按纯文本处理**（3.2.24 示例为纯文本）：`escapeHtml` + `DOMPurify.sanitize` 一次 + `Swal.fire({ html })`。**若后端确认为 Markdown**，需升级为 `marked.parse` + `DOMPurify.sanitize`（marked 已在 deps，但本任务不实现，待后端确认后再议）。 |
| 9 | ~~`tailwind.config` 是否配 `primary`~~ | 全文样式 | **已决（修正 C2）**：项目根本未安装 Tailwind。本设计采用 scoped CSS + CSS 变量方案 A，无 Tailwind、无新依赖。 |

> 剩余真正未决：#6（Consultation query）、#7（文章详情路由）、#8（弹层文本是否 Markdown，需后端确认）。其余均已在 R2 收敛为已决。容错路径已全部落地，Coder 可在不依赖后端确认的前提下完成实现。

---

## 9. 文件清单（交 Coder 执行）

新增：
- `src/stores/homeStore.ts`（见 §2）
- `src/composables/useHomeApi.ts`（见 §3）

修改（仅增补/重写，勿动其他类型与文件）：
- `src/types/api.ts`：新增 `Article`、`DiabetesType`、`DiabetesTypeDetail`（§1）。勿动既有 `ApiResponse`/`PaginatedResponse`/`Doctor` 等。
- `src/views/Home.vue`：完整重写（§4-§7），scoped CSS + CSS 变量，无 Tailwind。

不改：`router/index.ts`、`App.vue`、`composables/useApi.ts`、`utils/enumLabels.ts`、`server/**`、`assets/variables.css`、`package.json`、`vite.config.ts`（不引入任何新依赖）。

---

## 10. 对 Verifier 的提示（验收映射）

1. `vue-tsc --noEmit -p tsconfig.app.json` 零错误 → 类型严格、无 `any`；分页端点解包 `res.data.data` 类型合法（不再有 `res.data.data.data` 的 `Property 'data' does not exist on type Doctor[]` 错误，修正 C1）。
2. 未登录/登录两态渲染 → 首页 `requiresAuth:false`，三接口公开，store 不读 token。
3. `/api/doctors` 失败时医师区块降级、其余正常 → `Promise.allSettled` + 分区块 error 状态 + §6 重试按钮。
4. 轮播 4s 自动 + 圆点切换 + 离页清理 → `onMounted(startAuto)` / `onUnmounted(stopAuto)`，无 console 报错。
5. 糖尿病类型弹层展示病因/表现/治疗 → `showDiabetesType` 单次 `await detail` + `openTypeSwal`（修正 M4 无双弹），DOMPurify 净化一次 + `Swal.fire({ html })`，无未净化 v-html。
6/7. 视觉对齐 prototype + 无未净化 v-html + 无硬编码 URL → §7 scoped CSS 复刻 prototype 视觉（无 Tailwind 依赖，修正 C2）；§5 净化；HTTP 走 `api`（baseURL `/api`，不硬编码 host）。375px 无横向滚动：`.home-page { max-width: 480px; margin: 0 auto; }`，仅医师卡 `.doctor-scroll` 局部横向滚动。