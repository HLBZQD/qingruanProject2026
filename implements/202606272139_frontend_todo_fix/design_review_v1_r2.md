# 设计审查报告 v1-r2（复审）

> **审查对象**: `implements/202606272139_frontend_todo_fix/detail_v1.md`（首轮修复详细设计 v1-r1，已修订）
> **上次审查**: `design_review_v1_r1.md`（发现 2 阻塞 + 2 建议）
> **审查基线**: 诊断报告 `a_v8_diag_v3.md`、详细设计文档 `2_detailed_design_v3.md`、任务文件 `task_v1.md`
> **审查日期**: 2026-06-27
> **审查结论**: **APPROVED** — 2 个阻塞问题已正确修正，无新增问题，4 条建议均已处理

---

## 审查概述

复审重点验证三项：(1) 上次 2 个阻塞问题是否已正确修正；(2) 修订是否引入新问题；(3) 4 条建议是否已处理。经逐项交叉验证（设计文本 + 实际源码 + 诊断报告），结论为全部通过。

---

## 一、阻塞问题修正验证

### 阻塞问题 1（已修正）：`setFilter` 同步函数导致 `await` 无效

**原问题**: `setFilter()` 是同步函数（返回 `void`），内部调用 `fetchList()` 但不 `await`。导致 `onMounted` 中 `await store.setFilter(...)` 立即返回，`store.error` 检测在 `fetchList` 完成前执行，错误态逻辑失效。

**修正验证**（详设 Task 2 / S7，第157-183行）:

- `setFilter` 声明从 `function setFilter(...): void` 改为 `async function setFilter(...): Promise<void>`
- 内部 `fetchList()` 改为 `await fetchList()`
- 详细说明了"关键变更说明"块，解释了为什么这个改动解决了调用方 `await store.setFilter(...)` 后 `store.error` 检测的问题
- 函数签名变更表明确记录了返回值从 `void` 到 `Promise<void>` 的变化
- 边界条件表新增了"调用方 await setFilter 后读取 store.error"场景，确认 `fetchList` 已完成后 `error` 已回填

**源码交叉验证**:
- `punchStore.ts` 第142行确认 `setFilter` 当前是同步函数：`function setFilter(partial: {...}): void`
- `punchStore.ts` 第151行确认内部调用 `fetchList()` 无 `await`
- `Punch.vue` 第137行确认 `onMounted` 中使用 `await store.fetchList()` 后检测 `store.error`

**结论**: 修正正确。`async function` + `await fetchList()` 确保调用方 `await` 后 `store.error` 已回填。

---

### 阻塞问题 2（已修正）：Task 2 (S3) 与 Task 3 (S7) 执行顺序矛盾

**原问题**: Task 2 (S3) 删除 `store.fetchAnalysis()` 依赖 Task 3 (S7) 的 `setFilter` 增强，但 Task 2 排在 Task 3 之前执行，存在中间窗口期分析数据缺失。

**修正验证**（详设标题元数据第7行 + Task 2/3 开头的注意块 + 跨任务依赖矩阵第1522-1544行）:

- **执行顺序调整**: `Task1 (S9) → Task2 (S7) → Task3 (S3)`（原为 `Task1 → Task2(S3) → Task3(S7)`）
- **Task 2 (S7) 第127行明确标注**: "本 Task 在原设计中为 Task 3，根据审查报告调整为先于 S3 执行"
- **Task 3 (S3) 第241-242行明确标注**: "本 Task 在原设计中为 Task 2，根据审查报告调整到 S7 之后执行"
- **Task 3 (S3) 第243行依赖确认**: "`setFilter` 已在 Task2 (S7) 中改为 async（内部 `await fetchList()` + 防抖 `fetchAnalysis()`）。本 Task 中 `await store.setFilter(...)` 正确等待 fetchList 完成后才继续"
- **跨任务依赖矩阵第1543-1544行**: 明确列出两处"关键修正"，与 v1 对比差异

**结论**: 修正正确。S7 先增强 `setFilter`（加入 `await fetchList()` + 防抖 `fetchAnalysis()`），S3 再使用增强后的 `setFilter`。中间窗口期分析数据缺失的风险已消除。

---

## 二、建议处理验证

### 建议 3（已处理）：URL query 日期参数格式校验

**原建议**: 添加 `/^\d{4}-\d{2}-\d{2}$/.test()` 校验，拒绝非法格式走默认分支。

**处理验证**（详设 Task 3 / S3，第283-306行）:

- 新增 `const DATE_FORMAT_RE = /^\d{4}-\d{2}-\d{2}$/` 正则常量
- URL 参数处理从简单的 `typeof qStart === 'string' && qStart` 改为 `typeof qStart === 'string' && DATE_FORMAT_RE.test(qStart) && typeof qEnd === 'string' && DATE_FORMAT_RE.test(qEnd)`
- 边界条件表新增 3 行覆盖格式校验场景：非法格式、部分非法、仅一个参数
- 新增 `useRoute` 的 import 和调用

**结论**: 已处理。格式校验逻辑完整，`&&` 短路语义确保任一参数不通过则整体走默认分支。

---

### 建议 4（已标注）：createPunch 不写缓存导致打卡后刷新状态回退

**原建议**: 与 Product Owner 确认此行为是否可接受。

**处理验证**（详设 Task 5 / S2，第863行边界条件表）:

- 设计保持原有决策（`createPunchAction` 不写缓存）
- 详细说明了权衡理由："打卡操作频繁，每次写 sessionStorage 开销大（约 1-2ms 序列化）"、"缓存以方案生成为粒度更新"
- 明确标注："建议 Product Owner 确认此行为是否可接受"和"若产品需求要求打卡后刷新保持最新状态，可在 `createPunchAction` 成功后追加 `writePlanCache()`"
- 这是需要外部决策的设计权衡，非设计缺陷

**结论**: 已标注。设计将决策权正确移交 Product Owner，并提供了明确的修改路径。不阻塞本轮设计通过。

---

## 三、新问题检查

对修订引入的变更逐项检查：

### 3.1 `setFilter` 签名从 `void` 到 `Promise<void>` 对现有调用方的影响

| 调用位置 | 当前调用方式 | 修订后行为 | 影响 |
|---------|------------|----------|------|
| `Punch.vue:123` `onTypeFilter` | `store.setFilter({ punch_type: val })` 无 await | setFilter 变为 async，但调用方不 await → Promise 被忽略（fire-and-forget） | 无回归。与当前行为一致（当前也是 fire-and-forget fetchList） |
| `Punch.vue:128` `onDateChange` | `store.setFilter({...})` 无 await | 同上 | 无回归 |
| `Punch.vue:310` `onMounted` (Task 3 修订后) | `await store.setFilter({...})` | await 正确等待 fetchList 完成 | 行为改进 |

**结论**: 签名变更不影响现有调用方，且使 `onMounted` 中的 await 语义正确。

### 3.2 Task 3 (S3) 移除 `store.fetchAnalysis()` 的安全性

**检查**: Task 3 在 `onMounted` 中删除了 `store.fetchAnalysis()` 直接调用（第321行注释）。由于执行顺序已调整为 S7 先于 S3，`setFilter` 已被 S7 增强为包含防抖 `fetchAnalysis()`，该删除是安全的。

**结论**: 无问题。

### 3.3 Task 2 (S7) 防抖 timer 在组件卸载后的行为

**检查**: 设计第227行边界条件表已明确分析此场景——"`fetchAnalysis()` 内部的 `requestId` 快照保护"、"Store 是全局单例，这不导致内存泄漏"。标注为"需确认是否为预期行为"，但保持与 fire-and-forget 语义一致。

**结论**: 有文档记录，非阻塞问题。Store 单例模式下状态更新不会导致崩溃或泄漏。

### 3.4 Task 2 (S7) `setFilter` 改 punch_type 时也触发 `fetchAnalysis()`

**检查**: 设计第225行明确记录此行为——"仍然触发 `fetchAnalysis()`；分析数据应反映类型筛选变化（后端支持 punch_type 参数或全量分析）"。这是保守但合理的做法。

**结论**: 非问题。如果后端不支持 analysis 的 punch_type 参数，多一次 API 调用的开销可接受。

### 3.5 `toISOString().slice(0, 10)` 时区偏移

**检查**: 设计第367行已记录此已知限制——"UTC 零点可能跨日；但 `YYYY-MM-DD` 格式用于日期筛选，时区偏移 +/-1天在30天窗口内可接受"。

**结论**: 有文档记录，30天窗口下影响可忽略。

---

## 四、与诊断报告的一致性检查

| 诊断报告问题 | 对应 Task | 修订后一致性 |
|------------|----------|:----------:|
| S9: fetchAnalysis() 竞态保护缺失 | Task 1 | OK |
| S7: 日期筛选变更未同步触发 AI 分析重拉取 | Task 2 | OK |
| S3: Punch.vue 缺失默认近30天日期筛选 | Task 3 | OK |
| S1: Home.vue 缺失 sessionStorage 缓存 | Task 4 | OK |
| S2: LifePlan.vue 缺失 sessionStorage 方案缓存 | Task 5 | OK |
| S5a: ArticleDetailView.vue 缺失路由和组件 | Task 6 | OK |

所有 6 项任务的修复方案与诊断报告的建议一致。

---

## 五、源码交叉验证

| 设计引用 | 实际文件 | 验证结果 |
|---------|---------|:------:|
| `punchStore.ts:52` `requestId = ref(0)` | 第52行确认存在 | OK |
| `punchStore.ts:125-135` `fetchAnalysis()` 无竞态保护 | 第125-135行确认缺失 requestId | OK |
| `punchStore.ts:142-152` `setFilter()` 同步函数，无 await | 第142-152行确认 `function setFilter(...): void` + `fetchList()` 无 await | OK |
| `Punch.vue:137` `await store.fetchList()` | 第137行确认 | OK |
| `Punch.vue:144` `store.fetchAnalysis()` | 第144行确认 | OK |
| `Punch.vue` 未导入 `useRoute` | 第3行仅 `import { useRouter }` | OK（需新增） |
| `homeStore.ts` 存在 | 文件确认存在 | OK |
| `lifePlanStore.ts` 存在 | 文件确认存在 | OK |
| `useHomeApi.ts` 存在 | 文件确认存在 | OK |
| `api.ts` 存在 | 文件确认存在 | OK |
| `router/index.ts` 存在 | 文件确认存在 | OK |

所有设计引用的文件路径和行号与实际源码一致。

---

## 六、审查统计

| 维度 | 状态 |
|------|:---:|
| 上次阻塞问题 #1（setFilter 同步） | 已修正 |
| 上次阻塞问题 #2（执行顺序） | 已修正 |
| 上次建议 #3（URL 格式校验） | 已处理 |
| 上次建议 #4（createPunch 缓存） | 已标注（外部决策） |
| 修订引入的新阻塞问题 | 0 |
| 修订引入的新建议问题 | 0 |
| 设计文件引用与源码一致性 | 全部一致 |

---

## 七、最终裁决

**APPROVED**。修订后的详细设计 v1-r1 正确修正了首轮审查发现的 2 个阻塞问题（setFilter 异步化、执行顺序调整），4 条建议均已妥善处理，且修订过程未引入新问题。设计可以进入编码阶段。

执行顺序：**Task1 (S9) → Task2 (S7) → Task3 (S3)**，并行组 Task4 (S1) / Task5 (S2) / Task6 (S5a) 可独立启动。

---

*设计审查报告 v1-r2 结束。*
