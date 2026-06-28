# 第4轮规划审查报告 v4-r1

> **审查对象**: `plan.md` 第4.1节 v4行 + 诊断报告 `a_v8_diag_v3.md` P3 层详细规格
> **输入文件**: verify_v1.md, verify_v2.md, verify_v3.md, a_v8_diag_v3.md, task_v3.md（可推迟项清单）
> **审查日期**: 2026-06-27
> **审查人**: Plan Reviewer

---

## 0. 前置发现: task_v4.md 缺失

**`task_v4.md` 文件不存在于 `implements/202606272139_frontend_todo_fix/` 目录下。** v1、v2、v3 均有对应的详细任务文件（task_v1.md 317行, task_v2.md 298行, task_v3.md 1315行），但 v4 仅有 `plan.md` 中的一行概要描述:

> | **v4** | P3 | 6 | 7-11h | G7/G8/G12 + S10 + G3/G6 |

这与 v3-r1 审查时的前置发现完全一致——v3 当时同样缺失任务文件，仅 plan.md 一行描述。

本审查因此针对三个层次展开:
1. (a) plan.md 中 v4 的概要规划是否合理 —— 覆盖 4 个审查维度
2. (b) v3 可推迟项是否应纳入 v4 范围 —— 范围完整性审计
3. (c) 若需将 v4 细化为可执行任务文件，内部依赖和任务分解应如何设计

---

## 1. 审查维度一: P3 层 6 个问题是否全部覆盖

### 1.1 诊断报告 P3 层清单

诊断报告 8.2 节优先级表（第993-995行）定义了 P3 层 6 个问题:

| 编号 | 问题描述 | 严重度 | 预估工时 | 批处理组 | 前置依赖 |
|:----:|---------|:-----:|:------:|--------|:------:|
| **S10** | DOMPurify 默认配置，未加固 ALLOWED_TAGS/ATTR 安全参数 | 中 | 2-3h | — | G7, G12（工具抽取） |
| **G7** | safeContentHtml / safeAnalysisHtml 函数在 LifePlan.vue 与 Punch.vue 中重复定义 | 低 | 2-3h（合） | **批处理 G7+G8+G12** | 无 |
| **G8** | getErrorMessage 函数在 LifePlan.vue 与 Punch.vue 中重复定义 | 低 | 同上 | **批处理 G7+G8+G12** | 无 |
| **G12** | escapeHtml 仅 Home.vue 本地函数，未抽取为公共工具 | 低 | 同上 | **批处理 G7+G8+G12** | 无 |
| **G3** | Punch.vue 分析区缺少环形图，趋势图实现差异 | 中/低 | 3-5h（合） | **批处理 G3+G6** | 无 |
| **G6** | Punch.vue 缺少 refresh 刷新按钮 | 中/低 | 同上 | **批处理 G3+G6** | 无 |

### 1.2 plan.md v4 覆盖核对

| 诊断 P3 问题 | plan.md v4 描述 | 覆盖？ |
|:----------:|---------------|:-----:|
| S10 | "S10" | 是 |
| G7 | "G7" | 是 |
| G8 | "G8" | 是 |
| G12 | "G12" | 是 |
| G3 | "G3" | 是 |
| G6 | "G6" | 是 |

**判定: PASS** -- plan.md 的 v4 行明确列出了全部 6 个 P3 问题（G7/G8/G12 + S10 + G3/G6），覆盖率 100%。诊断报告的批处理建议（G7+G8+G12 合为一个重构批次，G3+G6 合为一个 UI 补充批次）在 plan.md 的 v4 描述中隐式体现为两组枚举。

---

## 2. 审查维度二: T1-T3 工具抽取是否无冲突

### 2.1 映射关系

plan.md 未定义 T1-T5 编号，按问题编号映射:

| 逻辑编号 | 问题 | 操作 | 目标文件 |
|:------:|------|------|---------|
| **T1** | G12 (escapeHtml) | 抽取本地函数 → 公共工具 | 新建/扩展 `src/utils/sanitize.ts` |
| **T2** | G7 (renderMarkdown) | 抽取重复函数 → 公共 composable | 新建 `src/composables/useMarkdown.ts` |
| **T3** | G8 (getErrorMessage) | 抽取重复函数 → 公共工具 | 新建 `src/utils/errorMessage.ts` |

### 2.2 文件冲突分析

| 任务 | 新建文件 | 修改文件 | 与其他任务的共享文件 |
|:--:|---------|---------|-------------------|
| G12 (T1) | —（扩展 `src/utils/sanitize.ts`） | `src/views/Home.vue` | **sanitize.ts 与 S10 共享** |
| G7 (T2) | `src/composables/useMarkdown.ts` | `src/views/LifePlan.vue`, `src/views/Punch.vue` | Punch.vue 与 G8/G3/G6 共享 |
| G8 (T3) | `src/utils/errorMessage.ts` | `src/views/LifePlan.vue`, `src/views/Punch.vue` | Punch.vue 与 G7/G3/G6 共享 |

**关键发现**: T1 (G12) 和 S10 共享同一个目标文件 `src/utils/sanitize.ts`。

- G12 将 `escapeHtml` 从 Home.vue 移至 `src/utils/sanitize.ts`
- S10 在同一文件中新增 `sanitizeHtml()` 函数（带 ALLOWED_TAGS/ATTR 白名单配置的 DOMPurify 封装）

两者操作同一文件，存在**文件级冲突**——必须在同一批次或定义明确的先后顺序，否则会产生 git 合并冲突。

### 2.3 工具之间的逻辑依赖

诊断报告 8.2 节标注 S10 的前置依赖为 "G7, G12（工具抽取）"。此依赖的逻辑含义:

1. **G12 → S10**: G12 先建立 `src/utils/sanitize.ts`（含 `escapeHtml`），S10 在同一文件中追加 `sanitizeHtml()`。**合理**。
2. **G7 → S10**: G7 先建立 `src/composables/useMarkdown.ts`（内含 `marked.parse() → DOMPurify.sanitize()` 管道），S10 完成后应将 G7 中的 `DOMPurify.sanitize()` 调用替换为 S10 的 `sanitizeHtml()`。**此依赖方向有争议**——让 S10（安全加固，2-3h）"依赖" G7（工具抽取，批处理 2-3h）在工程上意味着 S10 需要等待整个工具抽取批次完成才能开始。但实际上更合理的顺序是:

   **方案 A（诊断报告顺序）**: G7+G8+G12 先完成（建立 useMarkdown.ts / errorMessage.ts / sanitize.ts 骨架） → S10 随后完成（在 sanitize.ts 中添加 sanitizeHtml，并回修 useMarkdown.ts 中的 DOMPurify.sanitize() → sanitizeHtml()）。

   **方案 B（更优顺序）**: G12 先完成（建立 sanitize.ts + escapeHtml） → S10 接着完成（在 sanitize.ts 中追加 sanitizeHtml） → G7 最后完成（useMarkdown.ts 直接使用 sanitizeHtml 而非裸 DOMPurify.sanitize）。

   方案 B 避免了 S10 回修 G7 产物的二次修改，但将 G7 从"无依赖"变为"依赖 S10"。鉴于 G7+G8+G12 被诊断报告明确建议批处理，方案 A（按诊断报告标注的依赖方向执行）可接受——但需在 task_v4.md 中明确标注 S10 会修改 G7 的产出文件（`useMarkdown.ts`），以及具体修改点。

### 2.4 T1/T2/T3 之间的独立性

| 对 | 关系 | 判定 |
|:--:|------|:--:|
| G12 ↔ G7 | 独立——escapeHtml 与 renderMarkdown 是不同的工具函数，目标文件不重叠 | 无冲突 |
| G12 ↔ G8 | 独立——escapeHtml 与 getErrorMessage 是不同的工具函数，目标文件不重叠 | 无冲突 |
| G7 ↔ G8 | 共享 Punch.vue 和 LifePlan.vue 的修改——两任务都需要替换各自文件中的本地函数为 import | **文件级协调需求**——建议同一开发者按 G7→G8 顺序处理同一文件的两处替换，避免合并冲突 |

**结论**: T1-T3 工具抽取之间无逻辑冲突，但 G7 和 G8 共享 Punch.vue + LifePlan.vue 两个修改目标文件，需注意文件级协调。G12 与 S10 共享 `src/utils/sanitize.ts`，需在 v4 内部定义两者的先后顺序（诊断报告标注 S10 依赖 G12）。

---

## 3. 审查维度三: T4-T5 对 T1/T2 的依赖是否正确

### 3.1 映射

| 逻辑编号 | 问题 | 操作 | 目标文件 |
|:------:|------|------|---------|
| **T4** | G3 (环形图) | 在 Punch.vue 分析区添加 SVG 环形图 | `src/views/Punch.vue` |
| **T5** | G6 (刷新按钮) | 在 Punch.vue 筛选区添加刷新按钮 | `src/views/Punch.vue` |

### 3.2 功能依赖分析

**G3 (环形图) 对 G7/G8 的依赖**: 无功能依赖。
- G3 是纯 UI 新增（SVG `<circle>` + `stroke-dasharray` 实现环形图），不调用 `renderMarkdown()`、不调用 `getErrorMessage()`、不调用 `escapeHtml()`。
- G3 仅需要 `punchStore.analysis` 数据（已存在）和完成率数值计算（已存在）。

**G6 (刷新按钮) 对 G7/G8 的依赖**: 无功能依赖。
- G6 是纯 UI 新增（一个 `<button>` + `onRefresh()` 调用 `store.fetchList()` + `store.fetchAnalysis()`），不调用任何工具函数。
- G6 仅需要 punchStore 的 `fetchList()` 和 `fetchAnalysis()` 方法（已在 v1/v2 中完成修复和加固）。

### 3.3 文件级协调依赖

虽然 G3 和 G6 对 G7/G8 无功能依赖，但四者共享同一个修改目标文件 `src/views/Punch.vue`:

| 任务 | Punch.vue 修改区域 | 修改类型 |
|:--:|-------------------|---------|
| G7 (T2) | `<script setup>` 第55-60行 | 替换本地 `safeAnalysisHtml` 为 `import { renderMarkdown }` |
| G8 (T3) | `<script setup>` 第63-77行 | 替换本地 `getErrorMessage` 为 `import { getErrorMessage }` |
| G3 (T4) | 统计卡区域 第192-209行 | 新增 SVG 环形图替换渐变文字 |
| G6 (T5) | 筛选区 第270-304行 | 新增刷新按钮 |

**修改区域不重叠**: G7/G8 修改 `<script setup>` 的 import 和本地函数定义区，G3 修改统计卡 `<template>` 区，G6 修改筛选区 `<template>` 区。四个修改在文件的不同区域，理论上可以独立并行。

**但存在间接文件级依赖**: G7/G8 的 import 替换改变了 `<script setup>` 顶部的 import 结构。如果 G3/G6 在 `<script setup>` 顶部增加新的 import（如 G6 可能不需要新 import，G3 不需要额外 import），两者不会冲突。**当前分析结论: G3/G6 对 G7/G8 既无功能依赖也无强文件级依赖。**

### 3.4 建议的执行顺序

虽然没有硬依赖，但建议的顺序是:

```
G7+G8 (工具抽取, 稳定 Punch.vue import 结构) → G3+G6 (UI 新增, 基于稳定的 import 结构添加功能)
```

此顺序的理由是防御性的——如果 G7/G8 的 import 替换和 G3/G6 的 UI 新增同时进行，任何一方的修改位置估算偏差都可能导致合并冲突。先稳定基础代码结构（import 替换），再在其上添加新功能，是更安全的工程实践。

**结论**: T4 (G3) 和 T5 (G6) 对 T1 (G12) / T2 (G7) 无功能依赖，对 T2 (G7) / T3 (G8) 仅有文件级协调建议（非强依赖）。如果 task_v4.md 中标注 T4/T5 "依赖" T1/T2，从功能角度是不准确的——应标注为"文件级建议依赖"或"建议在 T1/T2 之后执行以降低合并冲突风险"。

---

## 4. 审查维度四: 本轮是否可以合理收尾

### 4.1 v4 不是最终轮次

plan.md 定义了 5 轮迭代（v1-v5），v4 之后仍有 v5:

| 轮次 | 优先级 | 任务数 | 预估工时 | 内容 |
|:----:|:------:|:-----:|:-------:|------|
| v4 | P3 | 6 | 7-11h | G7/G8/G12 + S10 + G3/G6 |
| v5 | P4 | ~15 | 7-12h | G24/G25 + G1/G2 + G9-G29剩余 + 设计文档更新 |

**v4 不能是整个项目的收尾轮次**——P4 层约 15 个低危问题（代码质量/可维护性 + 设计文档更新）仍需 v5 处理。

### 4.2 P3 层内部的收尾能力

v4 **可以合理完成 P3 层的收尾**:
- 6 个 P3 问题涵盖 3 个类别: 安全加固（S10）、工具抽取（G7/G8/G12）、UI 完善（G3/G6）
- 预估 7-11h，与 v2 (7-11h) 规模相当，单轮可消化
- 所有 P3 问题均无外部依赖（不需要后端 API 变更、不需要新的 npm 包），纯前端代码修改
- 诊断报告对每项问题均有详细修复建议（含代码示例和边界条件），执行者无需额外调研

### 4.3 重大遗漏: v3 可推迟项未纳入 v4 计划

**这是本审查发现的最严重问题。** task_v3.md 第 1248-1260 行列出了 6 项可推迟至 v4 的任务:

| 可推迟项 | 来源 | v3 简化交付策略 | v4 完整交付 | 节省工时 |
|---------|:----:|---------------|-----------|:------:|
| 断线重连指数退避 | G4 | 固定间隔 3 次重试（2s/4s/8s） | 指数退避 1s→30s，最大 5 次 | ~2h |
| 多医生独立会话路由 | G4 | 仅单医生对话 | Map<number,string> 完整多医生切换 | ~4h |
| fabOpen 悬浮按钮状态 | G4 | 移除或留空函数体 | 完整展开/收起动画 | ~1h |
| Consultation 在线标识 | G5 | `v-if="doctor.is_online !== false"`（双阴性保护，模板已占位） | 后端 is_online 字段就绪后激活 | 0h |
| DoctorChatView 免责声明弹窗（组件内） | G6 | 路由守卫 `requiresDisclaimer: true` 已覆盖 | 如产品要求双重确认 | 0h |
| 消息内容 Markdown 渲染增强 | G6 | 使用 `marked.parse()` 基础渲染 | 增加代码高亮、表格样式等 | ~1h |

此外，task_v3.md 末尾（第1315行）明确声明:

> *下一轮 v4 将处理: P3 层任务（G7/G8/G12 工具抽取 + S10 XSS 加固 + G3/G6 Punch UI 完善）**及 v3 可推迟项的完整交付**。*

但 plan.md 的 v4 行**完全没有提及这 6 项可推迟任务**。这是一个范围定义不一致——task_v3.md 承诺 v4 会处理 v3 可推迟项，但 plan.md（作为整体计划文件）的 v4 范围未包含它们。

**影响评估**:

| 场景 | v4 范围 | 预估总工时 | 说明 |
|------|---------|:--------:|------|
| plan.md 当前 v4 | P3 6 项 | 7-11h | 仅 P3 层 |
| 含 v3 可推迟项（实际需交付的 4 项） | P3 6 项 + v3 推迟 4 项 | **15-21h** | 断线重连(~2h) + 多医生路由(~4h) + fabOpen(~1h) + Markdown增强(~1h) = ~8h 额外 |

如果将 v3 的 4 项实际需交付的可推迟任务（排除 2 项 0h 的占位项）纳入 v4，总工时从 7-11h 翻倍至 15-21h。这超过了 v2 (7-11h) 和 v1 (8-13h) 的单轮规模。

### 4.4 v4 范围建议

**方案 A（严格按 plan.md）**: v4 仅处理 P3 6 项（7-11h），v3 可推迟项全部推至 v5。risk: task_v3.md 承诺未兑现，v5 已有 ~15 个 P4 项（7-12h），再叠加 v3 推迟的 ~8h 会使 v5 膨胀至 ~15-20h。

**方案 B（按 task_v3.md 承诺）**: v4 处理 P3 6 项 + v3 推迟的 4 项（15-21h）。risk: 单轮工时接近 v3 的简化版（28-40h），可能超出一轮迭代的可控范围。

**方案 C（推荐——拆分 v3 推迟项）**: v4 处理 P3 6 项（7-11h）+ 轻量推迟项（断线重连指数退避 ~2h + Markdown增强 ~1h = ~3h），合计 **10-14h**。将重量级推迟项（多医生路由 ~4h + fabOpen ~1h = ~5h）推迟至 v5 或创建独立的 v4.5 轻量轮次。理由: 断线重连指数退避和 Markdown 增强均属于 chatStore/DoctorChatView 的已有代码增强（修改 chatStore.ts / DoctorChatView.vue），与 v3 产出文件一致，自然应在 v4 跟进。多医生路由涉及 chatStore 架构级变更（Map 遍历、多医生独立状态管理），独立轮次更安全。

**无论选择哪个方案，plan.md 和 task_v4.md 必须就 v4 范围达成一致。当前两文档描述不一致是阻塞性问题。**

---

## 5. 内部依赖关系建议（供 task_v4.md 编写参考）

基于以上四个维度的分析，建议 v4 内部的任务分解和执行顺序如下:

### 5.1 任务分解建议

| 组号 | 问题 | 内容 | 预估 | 目标文件 |
|:----:|------|------|:---:|---------|
| **G1** | G12 + S10 | 工具抽取(escapeHtml) + DOMPurify 安全加固（共享 `sanitize.ts`） | 3-4h | 新建 `src/utils/sanitize.ts`，修改 Home.vue/LifePlan.vue/Punch.vue |
| **G2** | G7 | Markdown 渲染工具抽取（`useMarkdown.ts`） | 1-2h | 新建 `src/composables/useMarkdown.ts`，修改 LifePlan.vue/Punch.vue |
| **G3** | G8 | 错误消息工具抽取（`errorMessage.ts`） | 1-2h | 新建 `src/utils/errorMessage.ts`，修改 LifePlan.vue/Punch.vue |
| **G4** | G3 | Punch.vue 环形图实现 | 2-3h | 修改 `src/views/Punch.vue` 统计卡区域 |
| **G5** | G6 | Punch.vue 刷新按钮 | 1-2h | 修改 `src/views/Punch.vue` 筛选区 |

### 5.2 推荐执行顺序

```
G1 (sanitize.ts: escapeHtml + sanitizeHtml)
  └─→ G2 (useMarkdown.ts, 使用 G1 的 sanitizeHtml)
        └─→ G3 (errorMessage.ts, 独立但共享 LifePlan/Punch import 区)
              └─→ G4+G5 (环形图+刷新按钮, 可并行, 基于稳定的 import 结构)
```

关键依赖:
- **G1 → G2**: G2 的 `renderMarkdown()` 应使用 G1 的 `sanitizeHtml()` 而非裸 `DOMPurify.sanitize()`。如果 G1 和 G2 由同一开发者按顺序执行，此依赖自然满足。
- **G1+G2+G3 → G4+G5**: 工具抽取先稳定 Punch.vue 的 import 结构，UI 新增在其上进行。

### 5.3 v3 可推迟项的融入位置（如选择纳入 v4）

| 推迟项 | 融入位置 | 理由 |
|-------|---------|------|
| 断线重连指数退避 | 在 G1-G5 之前或之后均可（独立修改 chatStore.ts） | 与 P3 层文件不重叠 |
| Markdown 渲染增强 | 在 G2 之后（在已抽取的 `useMarkdown.ts` 中统一添加增强） | 依赖 G2 产出 |
| 多医生路由 | 建议推迟至 v5（架构变更，与 P3 层无交叉） | 独立轮次更安全 |
| fabOpen | 建议推迟至 v5（纯 UI 增强） | 非关键路径 |

---

## 6. 与前几轮审查建议的跟踪

| 来源 | 建议 | v4 关联性 |
|:---:|------|---------|
| v1-r1 建议4 | P4 列表 G24/G25 重复出现 — 清理 | v4 如涉及 plan.md 修订，应一并清理 |
| v2-r1 建议 R3 | G14-phase2 (console.warn→Promise.reject 切换) 在 v3/v4 中跟进 | v4 应检查 G14 当前状态。如果仍是 console.warn 阶段，需在 v4 或 v5 安排切换 |
| v3-r2 建议 S4 | G14-phase2 切换时机确认 | 同上 |
| v3-r2 建议 S3 | curl 预验证 SSE 端点 — 在 v3 开始前执行 | v3 已完成，此建议已过期 |

---

## 7. 风险矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|------|:---:|:---:|---------|
| task_v4.md 缺失导致执行者无具体指导 | **已发生** | 高 — 执行者面对一行描述无法开工 | 立即创建 task_v4.md，采用本报告建议的 5 组分解 |
| v3 可推迟项范围在 plan.md 与 task_v3.md 之间不一致 | **已发生** | 中 — v4 范围不清，交付物定义模糊 | 在 task_v4.md 中明确 v4 是否包含 v3 推迟项，更新 plan.md 保持一致性 |
| G12 和 S10 共享 `sanitize.ts`，若拆分执行会冲突 | 中（若拆分） | 低 — 同一开发者顺序执行可避免 | 建议 G12+S10 合并为一个任务组（G1），共享 sanitize.ts 一站式完成 |
| G7 的 `renderMarkdown` 使用裸 `DOMPurify.sanitize()`，S10 之后需回修 | 中 | 低 — 约 2 行代码修改 | 如果 G1 (sanitize.ts with sanitizeHtml) 先于 G2 (useMarkdown.ts) 执行，则无需回修 |
| Punch.vue 被 G2/G3/G4/G5 四个任务组共同修改 | 中 | 中 — 若拆分给不同开发者会产生合并冲突 | 建议同一开发者在 G2+G3 完成后顺序执行 G4+G5，或全部 Punch.vue 修改集中处理 |

---

## 8. 审查结论

### 判定: **REJECTED** -- 需补充 task_v4.md 并修正范围不一致后重新审查

### 拒绝理由

1. **task_v4.md 缺失**: v4 是 P3 层 6 个问题的修复轮次（7-11h），但 plan.md 仅用一行概要描述。对比 v1 (317行/6任务)、v2 (298行/5任务)、v3 (1315行/7任务组)，v4 缺少可执行的任务分解文件。执行者面对"G7/G8/G12 + S10 + G3/G6"一行描述无法开工。

2. **范围定义不一致（严重）**: task_v3.md 第 1315 行明确承诺 v4 将处理"v3 可推迟项的完整交付"（4 项实际需交付任务，约 8h），但 plan.md 的 v4 行完全未提及这些任务。两文档对 v4 范围的定义矛盾——执行者无法判断 v4 到底需要交付什么。

3. **内部依赖关系未定义**: P3 层的 6 个问题之间存在文件共享关系（sanitize.ts 被 G12 和 S10 共享，Punch.vue 被 G3/G6/G7/G8 四个任务修改），但 plan.md 未给出任何任务间的执行顺序或批处理建议。缺乏这些信息，多人协作时极易产生合并冲突。

4. **工具抽取与安全加固的鸡-蛋依赖未标注**: G7（renderMarkdown 抽取）创建 `useMarkdown.ts` 时使用裸 `DOMPurify.sanitize()`，S10（安全加固）创建 `sanitizeHtml()` 后需要回修 G7 的产出。这个回修循环在 plan.md 中未被识别，可能导致工具抽取完成后被安全加固再次修改（二次提交同一文件）。

### 批准条件

以下三项全部满足后重新审查:

1. **创建 `task_v4.md`**: 采用本报告第 5.1 节建议的 5 组分解（或等效的 4-6 组分解），每组包含:
   - 问题编号和严重程度
   - 预估工时
   - 前置依赖（组内和跨轮次）
   - 涉及文件清单（含操作类型: 新建/修改）
   - 具体修改描述（引用诊断报告第 306-508 行的详细规格）
   - 3-5 条可操作验收标准
   - 边界条件

2. **统一 v4 范围定义**: 在 task_v4.md 和 plan.md 中就以下问题达成一致并同步更新:
   - v4 是否包含 v3 可推迟项？
   - 如果包含，具体包含哪些（全部 6 项还是仅前 4 项实际需交付的）？
   - v4 的总工时预估需相应调整（当前 plan.md 的 7-11h 仅覆盖 P3 6 项）
   - 如果不包含，v3 可推迟项推迟到哪个轮次（v5 还是独立 v4.5）？

3. **标注内部依赖和执行顺序**: 在 task_v4.md 中:
   - 明确标注 G12 → S10 的文件级依赖（共享 sanitize.ts）
   - 明确标注 G7 (useMarkdown.ts) 与 S10 (sanitizeHtml) 之间的回修关系及建议顺序
   - 明确标注 G3/G6 对 G7/G8 的文件级协调建议（共享 Punch.vue）
   - 给出推荐执行顺序（参考本报告第 5.2 节）

### 补充建议（非阻塞）

| 编号 | 建议 | 来源 |
|:--:|------|------|
| S1 | 将 G12+S10 合并为一个任务组（共享 sanitize.ts，一站式完成 escapeHtml + sanitizeHtml），避免文件拆分冲突 | 本审查维度二发现 |
| S2 | G7 (useMarkdown.ts) 中的 `renderMarkdown()` 直接使用 S10 的 `sanitizeHtml()` 而非裸 `DOMPurify.sanitize()`——如果执行顺序是 G12+S10 → G7，则无需后续回修 | 本审查维度二发现 |
| S3 | G14-phase2 (console.warn→Promise.reject) 切换状态在 v4 开始前确认——若仍为 console.warn 阶段，安排在 v4 或 v5 切换 | v2-r1 建议 R3 跟踪 |
| S4 | v4 中修改 Punch.vue 的 4 个任务组（G2/G3/G4/G5）建议由同一开发者按序执行，减少合并冲突 | 本审查维度三发现 |
| S5 | 诊断报告 S10 与 G7 的依赖方向（"S10 依赖 G7, G12"）与本审查发现的更优顺序（"G12+S10 → G7"）存在分歧——建议在 task_v4.md 中采用更优顺序并注明与诊断报告的偏差理由 | 本审查维度二发现 |

---

*审查报告结束。待 task_v4.md 创建并修正范围不一致后重新提交审查。*
