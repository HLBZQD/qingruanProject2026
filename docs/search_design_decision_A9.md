# A9 搜索功能设计决策

> **对应任务**: docs/4_frontend_gap_todo_v2.md §12 Group A A9  
> **目标**: 在 NewsView.vue 内实现前端本地搜索模式，明确交互原型、状态转换、空结果与错误处理。  
> **前提约束**:
> - 后端当前无搜索端点，亦无 `?keyword=` 参数支持。
> - 文章量级预计 ≤200 条，单次最多拉取 100 条（受 `server/utils/pagination.js:9` pageSize 上限钳制）。
> - 必须绕过 homeStore 的 1 小时 sessionStorage 缓存，直接调用 API 以确保搜索结果实时性。

---

## 1. 设计原则

1. **最小可行实现 (MVP)**: 不新增后端端点，前端本地关键词匹配标题 + 标签。
2. **页面内搜索模式**: 在现有 `NewsView.vue` 中通过 URL 查询参数 `?keyword=xxx` 驱动进入搜索模式，不新增独立路由。
3. **实时反馈**: 输入框防抖 300ms，回车立即触发，清除按钮一键退出搜索。
4. **可访问性**: 搜索输入框带 `aria-label`，清除按钮带 `aria-label`，结果数量用 `aria-live`  polite 区域播报。

---

## 2. 搜索入口

### 2.1 入口位置

- **Home.vue**: 顶部搜索图标保持现有位置；点击后跳转至 `/news?keyword=`，聚焦搜索框并拉起软键盘。
- **NewsView.vue**: 在原有分类标签上方新增粘性搜索栏。

### 2.2 NewsView.vue 搜索栏 UI 草稿

```
┌─────────────────────────────────────┐
│  ← 健康资讯                          │  ← 返回 / 标题（保持现有）
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │
│  │ 🔍 输入关键词...           ✕  │  │  ← 搜索栏
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│  [全部] [饮食指导] [运动指南] ...    │  ← 分类标签（搜索模式下隐藏）
├─────────────────────────────────────┤
│  "xxx" 的搜索结果（共 N 条）          │  ← 搜索模式提示条
│                                     │
│  ┌─────────────────────────────┐    │
│  │ [封面] 标题（高亮关键词）    │    │
│  │      标签 / 作者 / 时间      │    │
│  └─────────────────────────────┘    │
│              ...                    │
│                                     │
│  [暂无相关文章，试试其他关键词]       │  ← 空结果
└─────────────────────────────────────┘
```

#### 元素说明

| 元素 | 说明 | UX 要点 |
|------|------|---------|
| 搜索输入框 | 占位符 `搜索文章标题或标签` | 最小高度 44px；focus 时显示主色边框；type="search" |
| 清除按钮 (✕) | 输入非空时显示 | 44×44px 点击区域；点击后清空输入并退出搜索模式 |
| 搜索提示条 | 搜索模式下显示 `"keyword" 的搜索结果（共 N 条）` | 使用 `aria-live="polite"` 播报结果数量 |
| 分类标签 | 搜索模式下隐藏 | 减少视觉干扰，避免与搜索筛选混淆 |
| 返回按钮 | 搜索模式下保留 | 点击返回 `/news`（无 keyword） |

---

## 3. 搜索状态转换图

```
                    ┌─────────────────┐
         ┌─────────│   浏览模式      │
         │         │ (keyword 为空)  │
         │         └────────┬────────┘
         │                  │ 用户输入关键词
         │                  ▼
         │         ┌─────────────────┐
         │         │   输入待命中    │
         │         │ (防抖 300ms)    │
         │         └────────┬────────┘
         │                  │ 防抖结束 / 回车
         │                  ▼
         │         ┌─────────────────┐
         │         │   搜索加载中    │
         │         │ (全量拉取文章)  │
         │         └────────┬────────┘
         │                  │ API 成功
         │                  ▼
         │      ┌──────────────────────────┐
         │      │     搜索结果展示         │
         │      │ (keyword + 高亮 + 过滤)  │
         │      └───────────┬──────────────┘
         │                  │
    清除/返回 ◄──────────────┤ N=0 时展示空结果
         │                  │
         │                  ▼
         │      ┌──────────────────────────┐
         │      │        空结果            │
         │      │ (提示更换关键词 / 生成)  │
         │      └──────────────────────────┘
         │
         │         ┌─────────────────┐
         └────────►│   API 错误      │
                   │ (显示 ErrorRetry)│
                   └─────────────────┘
```

---

## 4. 状态定义

在 `NewsView.vue` 的 `<script setup>` 中新增以下响应式状态：

```ts
const keyword = ref('')
const searchMode = computed(() => keyword.value.trim().length > 0)
const searchLoading = ref(false)
const searchError = ref('')
const searchResults = ref<Article[]>([])
const searchedKeyword = ref('') // 用于结果提示条，避免输入过程中抖动
```

---

## 5. 搜索触发逻辑

### 5.1 输入框行为

| 操作 | 行为 |
|------|------|
| 输入字符 | 300ms 防抖后自动触发搜索；若关键词为空则退出搜索模式 |
| 按回车 (Enter) | 立即触发搜索（取消待执行的防抖） |
| 点击 ✕ | 清空 `keyword`，退出搜索模式，URL 移除 `?keyword` |
| 返回按钮 | 返回 `/news`（无 keyword） |

### 5.2 伪代码

```ts
const { debounce } = useDebounce() // 使用 src/utils/helpers.ts 的 debounce

// URL 同步：进入页面 / 用户点击首页搜索时恢复 keyword
watch(() => route.query.keyword, (val) => {
  keyword.value = typeof val === 'string' ? val : ''
})

const doSearch = debounce(async (q: string) => {
  const trimmed = q.trim()
  router.replace({ query: trimmed ? { keyword: trimmed } : {} })
  if (!trimmed) return

  searchLoading.value = true
  searchError.value = ''
  try {
    // 全量拉取：pageSize=100；若 >100 条需循环 page=1,2
    const allArticles: Article[] = []
    let page = 1
    let hasMore = true
    while (hasMore) {
      const res = await getArticles({ page, pageSize: 100 })
      allArticles.push(...res)
      hasMore = res.length === 100
      page++
      // 安全上限：最多 2 页（200 条）
      if (page > 2) hasMore = false
    }

    const lower = trimmed.toLowerCase()
    searchResults.value = allArticles.filter((a) =>
      a.title.toLowerCase().includes(lower) ||
      a.tags.some((t) => t.toLowerCase().includes(lower))
    )
    searchedKeyword.value = trimmed
  } catch (err) {
    searchError.value = '搜索失败，请检查网络后重试'
  } finally {
    searchLoading.value = false
  }
}, 300)

watch(keyword, (val) => doSearch(val))
```

---

## 6. 搜索结果展示

### 6.1 关键词高亮

使用 `src/utils/helpers.ts` 的 `highlightKeyword(text, keyword)` 对文章标题进行高亮：

```html
<h3 class="card-title" v-html="highlightKeyword(item.title, searchedKeyword)"></h3>
```

> 摘要和标签不强制高亮，避免视觉噪音。

### 6.2 结果提示条

```html
<div v-if="searchMode" class="search-result-hint" aria-live="polite">
  "{{ searchedKeyword }}" 的搜索结果（共 {{ searchResults.length }} 条）
</div>
```

---

## 7. 空结果与错误处理

### 7.1 空结果

条件：`searchMode && !searchLoading && !searchError && searchResults.length === 0`

UI:

```html
<EmptyState
  icon="fa-search"
  title="未找到相关文章"
  :description="`没有找到与 "${searchedKeyword}" 相关的文章，换个关键词试试，或让 AI 生成一篇。`"
  action-text="生成健康资讯"
  @action="handleGenerate"
/>
```

### 7.2 错误处理

条件：`searchMode && searchError && searchResults.length === 0`

复用现有 `ErrorRetry` 组件：

```html
<ErrorRetry
  v-else-if="searchMode && searchError && searchResults.length === 0"
  :message="searchError"
  @retry="doSearch.flush()"
/>
```

---

## 8. 实现边界条件

| 场景 | 处理 |
|------|------|
| 文章 ≤100 条 | 单次 `getArticles({ page: 1, pageSize: 100 })` 完成 |
| 100 < 文章 ≤200 条 | 拉取 `page=1` 与 `page=2`，本地合并后过滤 |
| 文章 >200 条 | 按本设计文档约束，超过 200 条时应升级为后端搜索方案 |
| 用户连续输入 | 防抖取消旧请求，以最后一次输入为准 |
| 网络错误 | 展示 ErrorRetry，不清空已有结果 |
| 分类标签与搜索共存 | 搜索模式下隐藏分类标签；退出搜索后恢复分类筛选 |

---

## 9. 与 Group C C2 的衔接

本设计决策为 `C2 搜索功能` 的前置文档。C2 编码实现时应：

1. 按本 UI 草稿修改 `NewsView.vue`。
2. 按状态转换图实现状态机与 watch 监听。
3. 使用 `src/utils/helpers.ts` 的 `debounce` / `highlightKeyword`。
4. 使用 `useHomeApi.getArticles` 直接调用 API，不经过 homeStore 缓存。
5. 完成 C2 后，将 `Home.vue` 的 `onSearch()` 占位 Toast 替换为 `router.push('/news?keyword=')`。

---

## 10. 决策结论

**采用前端本地过滤方案**（标题 + 标签匹配，URL 驱动搜索模式），原因：

- 当前文章量级 ≤200 条，本地过滤性能可接受（<5ms）。
- 无需新增后端端点，开发周期最短。
- 升级路径清晰：当文章量 >200 条或用户反馈搜索体验不足时，迁移为后端 `GET /api/search?keyword=` 方案。
