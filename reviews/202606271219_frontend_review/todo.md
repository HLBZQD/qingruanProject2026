# 前端代码审查问题汇总

> 来源：审议式三轮代码审查（Round 1 设计合规性 + Round 2 代码质量 + Round 3 集成一致性）
> 审查范围：Home.vue、LifePlan.vue、Punch.vue 及关联 Store/API/类型文件
> 审查日期：2026-06-27

---

## 严重问题

### S1. Home.vue 缺失 sessionStorage 缓存机制（1小时过期）

- **位置**: `src/stores/homeStore.ts:38-58`
- **来源**: Round 1 #1
- **描述**: 设计文档 4.2/4.3 节要求首页数据缓存到 sessionStorage（1小时过期）。实际 `fetchHomeData()` 每次 `onMounted` 都直接调用 API，完全未实现缓存读写逻辑。
- **建议修复**: 在 `fetchHomeData()` 开头检查 sessionStorage 缓存（含时间戳），命中且未超时直接恢复数据；API 成功后写入 sessionStorage。

### S2. LifePlan.vue 缺失 sessionStorage 方案缓存（30分钟过期）

- **位置**: `src/stores/lifePlanStore.ts:42-52`
- **来源**: Round 1 #2
- **描述**: 设计文档 4.2 节要求方案缓存到 sessionStorage（30分钟过期）。`fetchCurrent()` 直接调 API，`generate()` 成功后未写缓存。页面刷新后缓存丢失，需重新请求。
- **建议修复**: `fetchCurrent()` 开头先读 sessionStorage 缓存；API 成功后写入；`generate()`/`adjust()` 成功后同步更新缓存。

### S3. Punch.vue 缺失默认近30天日期筛选

- **位置**: `src/views/Punch.vue:22-23`
- **来源**: Round 1 #3
- **描述**: 设计文档 4.3 节 Punch 流程图要求"默认近30天"。实际 `dateStart`/`dateEnd` 初始为空字符串，用户首次进入日期筛选器空闲。
- **建议修复**: 在 `onMounted` 中计算默认日期：`dateEnd` = 今天，`dateStart` = 30 天前，写入 filter。

### S4. LifePlan.vue 未读取 riskFormStore.result

- **位置**: `src/views/LifePlan.vue:75-82`
- **来源**: Round 1 #4
- **描述**: 设计文档 4.2 节要求 LifePlan 读取 `riskFormStore.result`。实际 `prefillFromRiskForm()` 只读取 `formData`（年龄/性别/身高/体重），完全忽略 `result`（风险等级、预测评分）。
- **建议修复**: 在 `onMounted` 中也读取 `riskForm.result`；若存在，用于展示上下文提示或影响方案生成偏好。

### S5. 路由表缺少 consultation/doctor/:id 和 news/article/:id

- **位置**: `src/router/index.ts:5-67`
- **来源**: Round 1 #5
- **描述**: 设计文档 1.6.1 路由映射表要求包含 `/consultation/doctor/:id` 和 `/news/article/:id`。实际路由数组中完全缺失这两个路由。
- **建议修复**: 添加对应路由配置，参考设计文档 meta 字段设定。

### S6. Home.vue 文章点击跳转目标与设计不一致

- **位置**: `src/views/Home.vue:80-82`
- **来源**: Round 1 #6
- **描述**: 设计文档 4.3 节要求文章点击跳转到 `/news/article/:id`。实际 `goArticle()` 将所有点击跳转到 `/news` 列表页，忽略 articleId 参数。
- **建议修复**: 待 `/news/article/:id` 路由恢复后，修改 `goArticle` 跳转到文章详情页。

### S7. Punch.vue 日期筛选变更未同步触发 AI 分析重拉取

- **位置**: `src/views/Punch.vue:127-132`
- **来源**: Round 1 #7
- **描述**: 设计文档 4.3 节要求日期变更时"重新请求 list+analysis"。实际 `onDateChange()` 只调 `store.setFilter()`，后者仅调用 `fetchList()`，不重拉 AI 分析。
- **建议修复**: 在 `setFilter()` 或 `onDateChange()` 中同时调用 `store.fetchAnalysis()`。

### S8. Token 明文存储在 localStorage，存在 XSS 窃取风险

- **位置**: `src/stores/authStore.ts:12`
- **来源**: Round 2 #1
- **描述**: JWT token 直接存储在 `localStorage`，任何 XSS 注入可读取。LocalStorage 无 HttpOnly 保护。
- **建议修复**: 评估切换到 httpOnly cookie（需后端协同）；短期最小改动切换到 sessionStorage。

### S9. fetchAnalysis() 无竞态保护

- **位置**: `src/stores/punchStore.ts:59` / `src/views/Punch.vue:144`
- **来源**: Round 2 #3
- **描述**: `fetchAnalysis()` 未使用 `requestId` 防竞态快照。快速离开并重进页面时，旧响应可能覆盖新请求状态。
- **建议修复**: 为 `fetchAnalysis()` 增加 `requestId` 快照机制，参考 `fetchList()` 实现。

### S10. DOMPurify 使用默认配置，未加固安全参数

- **位置**: `src/views/Home.vue:116` / `src/views/LifePlan.vue:98` / `src/views/Punch.vue:59`
- **来源**: Round 2 #4
- **描述**: DOMPurify 以默认配置运行，未显式设定 `ALLOWED_TAGS`/`ALLOWED_ATTR`/`ALLOWED_URI_REGEXP` 等白名单约束。Markdown 渲染路径存在潜在 XSS 绕过风险。
- **建议修复**: 创建统一 `sanitizeHtml()` 函数，配置标签/属性白名单，所有 `DOMPurify.sanitize()` 调用统一替换。

### S11. diabetesType query 参数在 LifePlan 中完全丢失

- **位置**: `src/views/Risk.vue:331` → `src/views/LifePlan.vue:88-91`
- **来源**: Round 3 #1
- **描述**: Risk.vue 传了两个 query 参数（riskLevel + diabetesType），但 LifePlan 仅读取 riskLevel，diabetesType 被静默丢弃。
- **建议修复**: LifePlan 增加 diabetesType 展示，或从 Risk 移除该参数。

### S12. LifePlan → Punch 打卡联动路径不一致

- **位置**: `src/views/LifePlan.vue:236-273` / `src/views/Punch.vue:348` / `src/router/index.ts:37-40`
- **来源**: Round 3 #2
- **描述**: LifePlan 内打卡（completedMap）与 Punch 页面打卡（punchStore records）是两套独立状态，无直接共享。用户从 LifePlan 打卡后进入 Punch 页面，列表需重新从后端拉取。
- **建议修复**: 确认后端 API 一致性；在文档中明确两条路径的数据一致保障机制。

### S13. 路由守卫 requiresDisclaimer 策略不一致

- **位置**: `src/router/index.ts:8-47`
- **来源**: Round 3 #3
- **描述**: LifePlan 要求 `requiresDisclaimer: true`，但 Punch 展示 AI 分析内容却不要求。防护策略不统一。
- **建议修复**: 考虑将 Punch 也加入 `requiresDisclaimer: true`，或在设计文档中明确区分策略理由。

---

## 一般问题

### G1. LifePlan.vue 组件树 CSS class / 按钮文案与设计文档有偏差

- **位置**: `src/views/LifePlan.vue:310-563`
- **来源**: Round 1 #8
- **描述**: 引导视图用 `lp-empty` 而非 `empty-state`；用 FontAwesome 图标代替 `<img>` 插图；按钮文案"立即定制方案"vs 设计"开始风险预测 / 生成我的生活方案"。
- **建议修复**: 对齐文案或确认偏离为有意设计决策。

### G2. Home.vue 糖尿病类型区"全部"链接为静态占位

- **位置**: `src/views/Home.vue:293-296`
- **来源**: Round 1 #9
- **描述**: 用 `<span class="section-link-static">` 无点击事件。其他区块"查看全部""更多"均已实现按钮。
- **建议修复**: 改为 `<button class="section-link" @click="goTypesList">`。

### G3. Punch.vue 分析区缺少环形图，趋势图实现差异

- **位置**: `src/views/Punch.vue:192-266`
- **来源**: Round 1 #10
- **描述**: 完成率仅渐变文字百分比，无环形图；趋势图用纯 CSS 叠柱而非单一柱状图。
- **建议修复**: 添加 SVG 环形图；CSS 实现可保留。

### G4. Punch.vue 滚动监听 + 加载更多按钮双模式冗余

- **位置**: `src/views/Punch.vue:107-118` (滚动) / `src/views/Punch.vue:427-433` (按钮)
- **来源**: Round 1 #11
- **描述**: 同时实现无限滚动和手动按钮，设计文档以"或"表示二选一。
- **建议修复**: 保持双机制，加注释说明意图。

### G5. LifePlan.vue 打卡弹窗交互顺序与流程图有差异

- **位置**: `src/views/LifePlan.vue:236-273`
- **来源**: Round 1 #13
- **描述**: 实际先弹 SweetAlert2 后调 API，流程图要求先 POST 后弹窗。当前实现更合理（避免无效 API 调用）。
- **建议修复**: 确认当前实现为有意优化，同步更新设计文档。

### G6. Punch.vue 缺少 refresh 刷新按钮

- **位置**: 设计文档 4.1.8 组件树筛选区
- **来源**: Round 1 #15
- **描述**: 设计文档包含刷新按钮 `<button class="btn-icon" id="btn-refresh">`，实际未实现。
- **建议修复**: 添加刷新按钮，点击时重新拉取 list + analysis。

### G7. safeContentHtml / safeAnalysisHtml 函数重复定义

- **位置**: `src/views/LifePlan.vue:94-99` / `src/views/Punch.vue:55-60`
- **来源**: Round 2 #6
- **描述**: Markdown→HTML 安全渲染管道在 LifePlan 和 Punch 中完全重复。
- **建议修复**: 抽取为 `src/composables/useMarkdown.ts` 公共函数。

### G8. getErrorMessage 函数重复定义

- **位置**: `src/views/LifePlan.vue:102-109` / `src/views/Punch.vue:63-77`
- **来源**: Round 2 #7
- **描述**: Axios 错误消息提取逻辑在两个组件中重复。
- **建议修复**: 抽取为 `src/utils/errorMessage.ts` 工具函数。

### G9. DiabetesTypeView 接口在组件和 Store 中重复定义

- **位置**: `src/views/Home.vue:17-20` / `src/stores/homeStore.ts:6-12`
- **来源**: Round 2 #8
- **描述**: 同一接口在两处独立定义，字段不一致时无编译错误。
- **建议修复**: 从 store 导出接口，组件 import 使用。

### G10. riskFormStore formData 缺少运行时类型守卫

- **位置**: `src/stores/riskFormStore.ts:14`
- **来源**: Round 2 #9
- **描述**: 从 sessionStorage 恢复时只做字段名检查，不做值类型校验（如 age 存为字符串）。
- **建议修复**: 对数字字段增加 `Number.isFinite` 强制转换。

### G11. LifePlan.vue form 使用 reactive + null，空字符串可能漏过校验

- **位置**: `src/views/LifePlan.vue:26-31`
- **来源**: Round 2 #10
- **描述**: `form.age == null` 检查无法捕获空字符串 `''`。Vue `v-model.number` 清空输入框时可能产生空字符串。
- **建议修复**: 在 `validateForm` 中使用 `Number.isFinite()` 做严格数值校验。

### G12. escapeHtml 仅 Home.vue 本地函数

- **位置**: `src/views/Home.vue:132-137`
- **来源**: Round 2 #11
- **描述**: HTML 实体转义为通用工具函数，但仅在 Home.vue 中定义。
- **建议修复**: 移动到 `src/utils/sanitize.ts` 公共导出。

### G13. Punch onScroll 使用 document.documentElement 耦合布局假设

- **位置**: `src/views/Punch.vue:107-118`
- **来源**: Round 2 #12
- **描述**: 无限滚动监听绑定在 `document.documentElement`，耦合了"页面即滚动容器"的假设。
- **建议修复**: 使用 `ref` 引用实际滚动容器，或加注释说明依赖假设。

### G14. API 函数 res.data.data 嵌套解包缺少 success 字段检查

- **位置**: `src/composables/useHomeApi.ts:38-39` 及所有 API composable
- **来源**: Round 2 #13
- **描述**: 所有 API 函数假设 `res.data.data` 存在。若后端返回 `{ success: false, data: null }`（业务错误但 HTTP 200），前端将静默损坏。
- **建议修复**: 每个 API 函数增加 `success` 字段检查，失败时抛出 Error。

### G15. loadMore 后 AI 分析不变，用户可能困惑

- **位置**: `src/stores/punchStore.ts:92-119` / `src/views/Punch.vue:144`
- **来源**: Round 2 #14
- **描述**: 分页加载更多后，AI 分析仍基于最初拉取的数据，用户可能困惑。
- **建议修复**: 在 UI 上添加提示说明分析基于整体数据而非当前页。

### G16. marked.parse 使用 { async: false }，未来兼容性风险

- **位置**: `src/views/LifePlan.vue:96` / `src/views/Punch.vue:57`
- **来源**: Round 2 #15
- **描述**: marked v5+ 默认为异步，`{ async: false }` 可能在将来版本移除。
- **建议修复**: 预配置 marked 全局选项，或改用 async + Suspense。

### G17. typeFilter ref 与 store filter 状态不同步风险

- **位置**: `src/views/Punch.vue:26-31` vs `src/stores/punchStore.ts:19-23`
- **来源**: Round 2 #16
- **描述**: 组件内 `typeFilter` ref 与 store `filter.punch_type` 维护两份相同语义状态。
- **建议修复**: 将 `typeFilter` 改为 computed 从 store 读取。

### G18. 缺少 AbortController 取消机制

- **位置**: `src/composables/useApi.ts:45-48` 已导出但未被使用
- **来源**: Round 2 #17
- **描述**: `createCancelToken()` 工具已提供但所有 API composable 均未使用。
- **建议修复**: 在组件 `onUnmounted` 时取消进行中请求。

### G19. Store action 命名不一致（fetch/get 前缀混用）

- **位置**: `homeStore.ts` / `lifePlanStore.ts` / `punchStore.ts` 所有 action
- **来源**: Round 3 #4
- **描述**: fetchHomeData / fetchCurrent / loadMore 前缀不统一。
- **建议修复**: 统一 HTTP 拉取操作用 `fetch*` 前缀。

### G20. Store error 字段粒度不一致

- **位置**: 三个 Store 的 error 字段定义
- **来源**: Round 3 #5
- **描述**: homeStore 按区块分（3个），lifePlanStore 按操作分（3个），punchStore 按资源分（2个）。
- **建议修复**: 统一按资源拆分策略。

### G21. Store loading 字段粒度与 error 不对称

- **位置**: 三个 Store 的 loading 字段定义
- **来源**: Round 3 #6
- **描述**: homeStore 单个 loading 覆盖三个接口，但 error 拆三个；punchStore 三个独立 loading。分层不一致。
- **建议修复**: 统一 loading 粒度策略。

### G22. Store retry* 方法实现模式不统一

- **位置**: `homeStore.ts:80-115` / `lifePlanStore.ts:129-137` / `punchStore.ts:155-163`
- **来源**: Round 3 #7
- **描述**: 前缀（retry vs retryFetch）、参数（有参 vs 无参）不一致。
- **建议修复**: 统一为 `retryXxx(): Promise<void>` 无参模式。

### G23. api.ts 类型定义与 API composable 脱节（死代码）

- **位置**: `src/types/api.ts:2-6` vs 所有 API composable
- **来源**: Round 3 #11
- **描述**: `ApiResponse<T>` / `ApiError` / `PaginatedResponse<T>` 已定义但所有 API composable 使用内联类型。
- **建议修复**: 删除死类型或统一 API composable 使用泛型。

### G24. page-enter 动画在 Punch.vue 中失效

- **位置**: `Punch.vue:155` class 引用 vs `Home.vue:333` / `LifePlan.vue:567-568` scoped 定义
- **来源**: Round 3 #12
- **描述**: Punch.vue 使用 `page-enter` class 但动画 keyframes 定义在 Home/LifePlan 的 `<style scoped>` 中，scoped 样式不跨组件生效。
- **建议修复**: 将 `page-enter` 动画提取到 `variables.css` 全局样式。

### G25. press CSS class 重复定义

- **位置**: `LifePlan.vue:866-869` / `Punch.vue:1008-1011`
- **来源**: Round 3 #13
- **描述**: `.press:active { transform: scale(0.96) }` 在两个文件中重复。
- **建议修复**: 提取到 `variables.css` 全局样式。

### G26. enumLabel 映射表缺少严格类型约束

- **位置**: `src/utils/enumLabels.ts:1`
- **来源**: Round 3 #10
- **描述**: `Record<string, Record<string, string>>` 类型过宽，拼写错误不会产生编译期报错。
- **建议修复**: 使用 `as const satisfies` + 模板字面量类型收紧。

### G27. punchStore.filter 使用 reactive 语义不明确

- **位置**: `src/stores/punchStore.ts:19-23`
- **来源**: Round 2 #5
- **描述**: `filter` 用 `reactive` 定义，`punch_type: undefined` 的清理语义不清晰。虽代码已兜底，但状态一致性隐患存在。
- **建议修复**: 改用 `ref` + 不可变更新模式。

### G28. Home.vue 搜索图标行为与设计不一致

- **位置**: `src/views/Home.vue:176-178`
- **来源**: Round 1 #14
- **描述**: 设计标注"装饰性"，实际有 `@click="onSearch"` 弹出 Toast 提示"开发中"。
- **建议修复**: 确认设计意图——保留功能占位或改为纯装饰。

### G29. Punch.vue router.back() 返回路径不确定

- **位置**: `src/views/Punch.vue:160`
- **来源**: Round 3 #14
- **描述**: 多入口进入 Punch 时 `router.back()` 可能返回到非预期页面。
- **建议修复**: 使用命名路由 `router.push('/profile')` 替代 `router.back()`。

---

## 统计

| 来源 | 严重 | 一般 |
|------|:---:|:---:|
| Round 1（设计合规性） | 7 | 8 |
| Round 2（代码质量） | 4 | 14 |
| Round 3（集成一致性） | 3 | 9 |
| 去重合并后 | **13** | **29** |

**总计：42 个问题**（13 严重 + 29 一般）
