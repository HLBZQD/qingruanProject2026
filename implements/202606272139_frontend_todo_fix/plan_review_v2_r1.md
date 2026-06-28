# 第2轮规划审查报告 v2-r1

> **审查对象**: `task_v2.md` + `plan.md` 第4.1节 v2行
> **输入**: verify_v1.md, code_v1.md, test_v1.md, test_review_v1_r1.md, a_v8_diag_v3.md
> **审查日期**: 2026-06-27
> **审查人**: Plan Reviewer

---

## 1. 任务选取审查

### 1.1 本轮选取

| 任务 | 问题 | 优先级 | 诊断定级 | 选取判断 |
|:----:|------|:------:|:------:|:------:|
| Task1 | S6 -- 文章点击跳转修复 | P1 | 中 | **正确** |
| Task2 | G14 -- API success字段拦截器 | P2 | 中 | **正确** |
| Task3 | S4 -- LifePlan读取result | P2 | 中 | **正确** |
| Task4 | S11 -- LifePlan消费diabetesType query | P2 | 低 | **正确** (与S4同文件批处理，经济合理) |
| Task5 | S8 -- Token迁移至sessionStorage | P2 | 中 | **正确** |

### 1.2 优先级覆盖分析

**P1 剩余**: S6 (唯一剩余P1项) -- 已纳入本轮。覆盖完整。

**P2 全部**: G14, S4, S8, S11 -- 4项全部纳入。覆盖完整。

**结论**: v2 选取了所有剩余的 P1+P2 项，5 个任务数量适中（与 v1 的 6 项规模相当），未遗漏高优先级问题。

### 1.3 任务粒度评价

- S6: 单函数单行修改，粒度极细但独立可交付 -- **合理**
- G14: 单文件单函数修改（拦截器），影响面全项目 -- **合理**（不应拆散，拦截器统一生效）
- S4+S11: 同文件批处理，建议同一开发者集中完成 -- **合理**（减少上下文切换）
- S8: 涉及21处修改点的安全迁移，含跨Store联动清理 -- **粒度适中**

---

## 2. 前置依赖审查

### 2.1 硬性依赖

| 任务 | 依赖项 | v1状态 | 实际验证 |
|------|--------|:------:|---------|
| S6 | S5a (ArticleDetailView + 路由) | 完成 | 路由 `/news/article/:id` 已在第22行注册，组件 265 行新建，类型/API 均完成。**已确认** -- 构建产物含 `ArticleDetailView-BfLD0DvN.js` |
| S8 | S1/S2 (clearHomeCache/clearPlanCache 暴露) | 完成 | `homeStore.ts:86,228` 定义了 `clearHomeCache` 并暴露在 return 块；`lifePlanStore.ts:86,226` 定义了 `clearPlanCache` 并暴露在 return 块。**已确认** |

### 2.2 建议依赖

| 任务 | 标注的前置 | 审查结论 |
|------|-----------|---------|
| G14 | 建议 S9 完成 | **依赖关系不成立** -- S9 是 punchStore 内的 fetchAnalysis 竞态保护（操作 requestId 快照），G14 是 useApi.ts 响应拦截器的 success:false 检查。两者代码层面完全独立，无共享逻辑、无共享文件、无执行顺序约束。task_v2 将其列为"建议"不构成阻塞，但该标注本身缺乏逻辑依据，应移除或修正为"无依赖"。**不影响本轮执行，仅影响文档准确性。** |
| S8 | 建议 S1/S2 完成 | **成立** -- S8 的 clearAuth() 联动清理需要 homeStore.clearHomeCache() 和 lifePlanStore.clearPlanCache()，两者在 v1 中已暴露。 |

### 2.3 依赖审查总评

所有硬性依赖均已满足。G14 的"建议前置 S9"标注为逻辑误判但不阻塞执行。S8 对 S1/S2 的依赖真实且已就绪。

---

## 3. 遗漏检查

### 3.1 本轮P1/P2覆盖

| 优先级层 | 总数 | 已完成(v1) | 本轮(v2) | 遗漏 |
|:------:|:---:|:--------:|:------:|:---:|
| P1 | 6 | 5 (S1/S2/S3/S7/S9) | 1 (S6) | **无** |
| P2 | 4 | 0 | 4 (G14/S4/S8/S11) | **无** |

### 3.2 跨轮次遗漏检查

- **P0 (S5b-1/S5b-2)**: 不在本轮范围，正确推迟至 v3（预估 36-52h，需独立轮次）
- **P3 (G7/G8/G12/S10/G3/G6)**: 不在本轮范围，推迟至 v4 -- **合理**（P2 > P3 优先级正确）
- **P4 低危项**: 不在本轮范围 -- **合理**

### 3.3 设计文档未覆盖项的监控

S6、S4、S11 均有明确的设计文档依据（诊断报告第105-120行、183-197行、328-341行）。S8 和 G14 是诊断过程中独立发现的安全/架构改进项，设计文档未覆盖但诊断报告给出了充分的修复理由和边界分析。**无遗漏**。

---

## 4. 工作量预估审查

### 4.1 逐任务评估

| 任务 | plan.md 预估 | 独立审查 | 依据 |
|------|:----------:|:-----:|------|
| S6 | ~5行 | 0.5-1h | 单函数修改：移除 `_id` 前缀 + `router.push({ path })` + 防御性 `if (!id) return`。极简单，含验证 1h 足够。 |
| G14 | ~12行 | 2-3h | 拦截器内 12 行新增，但审计工作量被低估：(a) 需确认 10 个 API 函数的 `res.data.data` 解包链均经过拦截器；(b) 需验证 3 个 Store 的全部 catch 块的兼容性（诊断报告 v12 已完成此审计，但修复者仍需独立确认）；(c) 分阶段部署策略（console.warn → Promise.reject）需与团队确认日志收集期。代码量小但验证面广。 |
| S4 | ~15行 | 1.5-2h | 新增 `riskResultHint` reactive + 模板扩展。需理解 `riskForm.result` 结构（risk_level/risk_score/matched_diabetes_type）和 `riskForm.loadFromStorage()` 水合时机。 |
| S11 | ~10行 | 1-1.5h | 新增 `diabetesTypeHint` computed + 模板展示。与 S4 同在 LifePlan.vue，协同集中完成可节省约 0.5h（合并 onMounted 和模板修改）。 |
| S8 | ~40行 | 3-4h | 21处 localStorage→sessionStorage 迁移 + BC 增强(~30行) + clearAuth 联动清理(import/store实例引入)。需全文搜索确认无遗漏（`must_change_password`/`disclaimer_accepted` 保留在 localStorage）。最复杂任务。 |

### 4.2 总工时评估

| 场景 | 审查评估 | plan.md 预估 | 偏差 |
|------|:------:|:----------:|:---:|
| 单人串行 | **8-11.5h** | 7-11h | **+1h 上限**（G14 审计工作量和 S8 需全文确认的隐性时间被轻微低估） |
| S4+S11 合并 | **2.5-3h** | 未单独标注 | 合并后节省约 0.5h |

### 4.3 工时结论

plan.md 的 7-11h 预估**基本合理但上限偏紧**。G14 的审计验证和 S8 的全文件 `localStorage` 逐点确认需要在代码修改之外分配额外时间。建议将预估修订为 **8-12h**，或将 G14 的审计部分视为独立检查项（非阻塞）。

---

## 5. 执行顺序审查

task_v2 推荐顺序: **G14 -> S6 -> S4+S11 -> S8**

| 顺序位置 | 任务 | 审查评价 |
|:------:|------|---------|
| 1 | G14 | **正确** -- 影响全部 API 函数，统一拦截器生效后其他任务的 API 调用自动受益。但 G14 是拦截器修改（非业务功能），应先于功能修复执行。 |
| 2 | S6 | **正确** -- 单行修改快速验证 S5a 产出可用，无理由推迟。 |
| 3 | S4+S11 | **正确** -- 同在 LifePlan.vue，同一开发者批处理减少合并冲突。 |
| 4 | S8 | **正确** -- 依赖 S1/S2 的 cleanXxxCache 暴露，本轮最复杂任务，放最后合理。 |

**无调整建议**。执行顺序合理。

---

## 6. 风险与改进建议

### 6.1 已识别风险（task_v2 + plan.md 中已标注）

| 风险 | 处置 | 评价 |
|------|------|------|
| G14 分阶段部署 | 先 console.warn 日志收集，后切换 reject | **正确**。task_v2 选择了第一阶段的 console.warn 版本。 |
| S8 UX 退化 | BroadcastChannel 增强（约30行） | **正确**。task_v2 将其标注为"强建议"并提供了完整实现。 |
| S8 的 linked cleanup 遗漏 | clearAuth() 末尾调用 clearHomeCache/clearPlanCache | **已标注**。task_v2 5.3 节明确列出。 |

### 6.2 新增建议（非阻塞）

1. **文档修正: G14 的"建议前置 S9"标注建议移除** -- S9 (punchStore.fetchAnalysis 竞态保护) 与 G14 (useApi.ts 响应拦截器) 在代码层面完全独立，标注为依赖缺乏逻辑依据。不影响执行但可能误导后续读者。

2. **S8 的 import 策略**: task_v2 要求在 authStore 顶部引入 homeStore 和 lifePlanStore 实例。需注意 Pinia Store 的循环依赖风险 -- 如果 homeStore/lifePlanStore 内部也引用了 authStore（如读取 token），直接 import 可能导致初始化顺序问题。建议在 `clearAuth()` 内部通过 `useHomeStore()` / `useLifePlanStore()` 获取实例（Pinia 允许在 action 内部调用其他 Store），而非在模块顶层 import。

3. **G14 的分阶段部署需明确交付物**: task_v2 提到的"第一阶段 console.warn 日志收集"是一种临时方案，需在 v3 或 v4 中跟进切换为 Promise.reject。建议在 task_v2 末尾或 plan.md 的 v3 计划中增加一个明确的跟进项（如 G14-phase2），避免遗忘。

---

## 7. 审查结论

### 判定: **APPROVED**

### 通过理由

1. **任务选取覆盖完整**: 本轮选取了全部剩余的 P1 (1项) 和 P2 (4项) 问题，无遗漏高优先级项。
2. **硬性依赖全部满足**: S6 的前置 S5a 已完成（ArticleDetailView + 路由已验证构建通过）；S8 的联动清理依赖 clearHomeCache/clearPlanCache 已由 v1 的 S1/S2 暴露。
3. **执行顺序合理**: G14 (拦截器) 最先生效 -> S6 快速验证 -> S4+S11 批处理 -> S8 复杂收尾。
4. **工作量基本合理**: 7-11h 可接受，建议上限放宽至 12h（G14 审计验证和 S8 全文确认的隐性时间）。
5. **风险均已识别**: 分阶段部署、UX退化、联动清理三层风险均有缓解方案。

### 非阻塞改进建议

| 编号 | 建议 | 优先级 |
|:--:|------|:-----:|
| R1 | 移除 task_v2 中 G14 的"建议前置 S9"标注（逻辑不成立） | 低（文档质量） |
| R2 | S8 的 clearAuth() 内通过 `useHomeStore()`/`useLifePlanStore()` 获取 Store 实例，避免模块顶层 import 导致的 Pinia 循环依赖风险 | 中（技术正确性） |
| R3 | 在 v3 计划中增加 G14-phase2 跟进项（console.warn→Promise.reject 切换） | 中（防止遗忘） |

---

*审查报告结束。*
