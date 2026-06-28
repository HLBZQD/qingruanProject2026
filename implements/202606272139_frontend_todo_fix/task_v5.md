# 前端待办修复 -- 第5轮任务 v5

> **依据**: 诊断报告 `redeliberations/202606271705_frontend_todo_diagnosis/a_v8_diag_v3.md` P4 层详细规格（第996-1004行）
> **计划文件**: `plan.md` 第4.1节 v5行
> **审查报告**: `plan_review_v5_r1.md`（8组分解 + 内部依赖 + 范围裁决）
> **上一轮**: v1 已完成 S9/S7/S3/S1/S2/S5a (6项)，v2 已完成 S6/G14/S4/S11/S8 (5项)，v3 已完成 S5b-1/S5b-2 (chatStore SSE核心 + DoctorChatView + 路由)，v4 已完成 G12/S10/G7/G16/G8/G3/G6 (7项)
> **范围**: P4 层 24 个问题条目 — 18 个代码修复 + 4 个设计文档更新 + 2 个仅确认（G4/G5 已在 v4 标记）——另含 v3 可推迟项（推迟至 v6，见范围裁定）
> **日期**: 2026-06-28
> **总工时**: 9-13.5h（P4 代码修复 + 设计文档更新，不含 v3 推迟项）；含 Group 8 (Store 一致性) 则 11.7-18.5h

---

## 范围裁定: v3 可推迟项推迟至 v6

task_v4.md 第13-32行将6项 v3 可推迟任务推迟至 v5。经审查报告 `plan_review_v5_r1.md` 第1.3-1.5节分析，v5 当前 P4 层已有 24 个问题条目（代码修复 7-11.5h + 设计文档 ~2h），若再纳入 v3 推迟项（~8h），总工时将膨胀至 17-22.5h，超过单轮可控范围。

**裁决: v3 可推迟项全部推迟至 v6。**

| 推迟项 | 来源 | v3 简化交付 | v6 完整交付 | 工时 |
|-------|:----:|-----------|-----------|:---:|
| 断线重连指数退避 | G4 | 固定间隔3次重试 | 指数退避 1s->30s，最大5次 | ~2h |
| 多医生独立会话路由 | G4 | 仅单医生对话 | Map<number,string> 完整多医生切换 | ~4h |
| fabOpen 悬浮按钮状态 | G4 | 移除或留空 | 完整展开/收起动画 | ~1h |
| Consultation 在线标识 | G5 | 模板占位 | 后端 is_online 就绪后激活 | 0h |
| DoctorChatView 免责声明弹窗 | G6 | 路由守卫已覆盖 | 如产品要求双重确认 | 0h |
| 消息内容 Markdown 渲染增强 | G6 | marked.parse() 基础渲染 | 代码高亮、表格样式 | ~1h |

> **注**: 上述6项中前4项（~8h）为实际需交付的代码修改任务，后2项（0h）为占位项。v6 任务文件需明确纳入。

> **v5 最终范围**: P4 层 24 个问题条目（18 代码修复 + 4 设计文档更新 + 2 仅确认/已由 v4 标记）。G3/G6 已在 v4 完成，v5 排除。G14-phase2 切换状态在 v5 开始前确认（详见跨轮次依赖节）。

---

## 已完成项确认: G3/G6 已在 v4 完成

verify_v4.md 确认以下两项已在第4轮完整实现:

| 问题 | v4 任务组 | 验证状态 |
|:----:|:--------:|:------:|
| **G3** (Punch.vue 环形图) | G4 任务组 | 编译 PASS + 构建 PASS — SVG 环形图 + 动画 + 边界条件 |
| **G6** (Punch.vue 刷新按钮) | G5 任务组 | 编译 PASS + 构建 PASS — fa-rotate + 防双击 + 筛选保持 |

**结论: G3 和 G6 不出现在 v5 任务列表中。**

---

## P4 层完整问题清单与工时

| 编号 | 问题描述 | 行动类型 | 预估工时 | 所属任务组 |
|:----:|---------|:------:|:------:|---------|
| **S12** | LifePlan->Punch 打卡联动路径一致性（间接一致性模型注释） | 设计文档更新 | ~0.5h | G1 |
| **S13** | 路由守卫 requiresDisclaimer 策略不一致（设计文档补充说明） | 设计文档更新 | ~0.5h | G1 |
| **G4** | 双模式并存（Markdown渲染同步/异步）——设计文档标注为有意并存 | 设计文档更新 | ~0.5h | G1 |
| **G5** | LifePlan 打卡弹窗交互顺序——设计文档流程图更新 | 设计文档更新 | ~0.5h | G1 |
| **G24** | page-enter 动画在 Punch.vue 中失效 | 代码修复 | 1-2h（合） | G2 |
| **G25** | press CSS class 重复定义 | 代码修复 | 同上 | G2 |
| **G1** | LifePlan.vue CSS class/按钮文案偏差 | 代码修复/设计确认 | 1-2h（合） | G3 |
| **G11** | LifePlan.vue form 使用 reactive+null，空字符串可能漏过校验 | 代码修复 | 0.3-0.5h | G3 |
| **G2** | Home.vue 糖尿病类型区"全部"链接为静态占位 | 代码修复/设计确认 | 1-2h（合） | G4 |
| **G9** | DiabetesTypeView 接口在组件和 Store 中重复定义 | 代码修复 | 0.3-0.5h | G4 |
| **G28** | Home.vue 搜索图标行为与设计不一致 | 代码修复 | 0.3-0.5h | G4 |
| **G27** | punchStore.filter 使用 reactive 语义不明确 | 代码修复 | 0.3-0.5h | G5（前置） |
| **G13** | Punch onScroll 使用 document.documentElement 耦合布局假设 | 代码修复 | 0.5-1h | G5 |
| **G15** | loadMore 后 AI 分析不变，用户可能困惑 | 代码修复 | 0.3-0.5h | G5 |
| **G17** | typeFilter ref 与 store filter 状态不同步风险 | 代码修复 | 0.3-0.5h | G5 |
| **G29** | Punch.vue router.back() 返回路径不确定 | 代码修复 | 0.3-0.5h | G5 |
| **G10** | riskFormStore formData 缺少运行时类型守卫 | 代码修复 | 0.3-0.5h | G6 |
| **G23** | api.ts 类型定义与 API composable 脱节（死代码） | 代码修复 | 0.3-0.5h | G7 |
| **G26** | enumLabel 映射表缺少严格类型约束 | 代码修复 | 0.3-0.5h | G7 |
| **G18** | 缺少 AbortController 取消机制（homeStore/lifePlanStore） | 代码修复 | 1-2h | G8 |
| **G19** | Store action 命名不一致（fetch/get 前缀混用） | 代码修复 | 0.5-1h | G8 |
| **G20** | Store error 字段粒度不一致 | 代码修复 | 0.3-0.5h | G8 |
| **G21** | Store loading 字段粒度与 error 不对称 | 代码修复 | 0.5-1h | G8 |
| **G22** | Store retry* 方法实现模式不统一 | 代码修复 | 0.3-0.5h | G8 |

**工时汇总**:

| 类别 | 条目数 | 工时 |
|------|:-----:|:---:|
| P4 代码修复（G2-G8，18 项） | 18 | **7-11.5h** |
| P4 设计文档更新（G1，4 项） | 4 | **~2h** |
| **v5 核心交付（G1-G7）** | **22** | **9-13.5h** |
| Group 8 Store 一致性（可选） | 5 | 2.7-5h |
| **v5 全部（含可选 G8）** | **27** | **11.7-18.5h** |

---

## 执行顺序与依赖图

```
阶段 A: 设计文档更新（无代码，可随时执行）
  [G1] S12 + S13 + G4 + G5  设计文档 4 项更新  ~2h

阶段 B: 全局样式 + 独立修复（无 Store 依赖，可并行）
  [G2] G24 + G25            全局 CSS 提取        1-2h
  [G3] G1 + G11             LifePlan 修复        1-2.5h
  [G4] G2 + G9 + G28        Home 修复            0.9-1.5h
  [G6] G10                  riskFormStore 安全   0.3-0.5h
  [G7] G23 + G26            类型清理             0.6-1h

阶段 C: Punch 修复（G27 硬前置 → G13/G15/G17/G29）
  [G5] G27 → G13 + G15 + G17 + G29  Punch 一站式  1.7-3h

阶段 D: Store 一致性（可选，可推至 v6；如执行则建议在 G5 之前）
  [G8] G18 + G19 + G20 + G21 + G22  Store 接口统一  2.7-5h
```

**关键依赖说明**:

| 依赖 | 方向 | 性质 | 说明 |
|------|:----:|------|------|
| **G27 -> G17** | G27 先于 G17 | **硬依赖（Store接口变更影响模板访问路径）** | punchStore.filter 从 reactive 改为 ref 后，模板中 `filter.xxx` 变为 `filter.value.xxx`。G17 的 `typeFilter` computed 依赖 `store.filter.punch_type`，必须在 G27 完成后才能正确重构。若 G17 先于 G27 执行，G27 完成后需回修 G17 的 filter 访问路径。 |
| **G27 -> G13/G15/G29** | G27 先于 G13/G15/G29 | **建议依赖（避免回修）** | G13/G15/G29 在 Punch.vue 中引用 store 状态，G27 改变 filter 访问方式后这些引用路径需同步更新。建议 G27 最先执行以稳定 Store 接口。 |
| **G9 -> G23** | G9 先于 G23 | **建议依赖（避免误删引用）** | G9 合并 DiabetesTypeView 接口后类型引用关系更清晰，G23 删除 api.ts 死代码时不易误删仍在使用的类型。 |

**Store 层依赖关系矩阵（G18-G22 均修改 3 个 Store）**:

| Store 文件 | G18 (竞态保护) | G19 (命名) | G20 (error粒度) | G21 (loading粒度) | G22 (retry签名) | 修改维度数 |
|-----------|:--:|:--:|:--:|:--:|:--:|:------:|
| `src/stores/homeStore.ts` | ++ | ~（保持） | ~（保持） | ++（拆 loading） | ~（保持） | 2 |
| `src/stores/lifePlanStore.ts` | ++ | ++（重命名） | ++（合并error） | ~（保持） | ++（统一签名） | 4 |
| `src/stores/punchStore.ts` | ~（已在S9完备） | ~（保持） | ~（保持） | ~（保持） | N/A | 0 |

> **冲突风险**: lifePlanStore.ts 被 4 个维度同时修改——G19 重命名 `generate` -> `createPlan` / `adjust` -> `updatePlan`，G20 合并 `generateError`+`adjustError` -> `mutationError`，G22 统一 `retryGenerate` 签名为无参。三个维度的修改交织在同一 Store 文件内，强烈建议由同一开发者集中完成（一站式重构），避免多人并行修改同一文件导致的合并冲突和接口不一致。homeStore.ts 被 G18（pageInstanceId 新增）和 G21（loading 拆分）两个维度修改，也建议同一开发者顺序执行。

**推荐执行顺序（单人串行）**: G1（设计文档） -> G2（全局CSS） -> G7（类型清理） -> G6（Store安全） -> G3（LifePlan修复） -> G4（Home修复） -> G5（Punch修复，含G27前置） -> G8（Store一致性，可选）

**推荐执行顺序（二人并行）**:
```
开发者 A: G1（设计文档，~2h）
  -> G2（全局CSS，1-2h）
  -> G7（类型清理，0.6-1h）
  -> G6（Store安全，0.3-0.5h）
  -> G5（Punch修复: G27 -> G13+G15+G17+G29，1.7-3h）
  -> G8（Store一致性，可选，2.7-5h）
  合计: 6.1-11.5h（含G8）

开发者 B: G3（LifePlan修复，1-2.5h）  // 可与 G2/G7/G6 并行
  -> G4（Home修复，0.9-1.5h）
  合计: 1.9-4h
  // 完成后可协助 G5（Punch修复）或转入 G8（Store一致性）
```

**推荐执行顺序（三人并行）**:
```
开发者 A: G1 -> G2 -> G7 -> G6 -> G5（关键路径: 设计文档 -> CSS -> 类型 -> 安全 -> Punch）
开发者 B: G3 -> G4（LifePlan + Home 独立修复）-> 完成后协助 G5 或 G8
开发者 C: G8（Store 一致性，独立于 A/B，但需注意 homeStore.ts 与 G5 的 G27 共享——G8 中 homeStore 修改与 G27 punchStore 修改无冲突）
```

---

## 任务组 G1: 设计文档更新 -- S12 + S13 + G4 + G5

- **问题编号**: S12, S13, G4, G5
- **严重程度**: 低（4项均为设计文档更新，无代码修改）
- **预估工时**: ~2h（4项各 ~0.5h）
- **前置依赖**: 无
- **批处理理由**: 4项均仅修改 `docs/2_detailed_design_v3.md`，同文件不同章节，一次性更新避免多次文档提交。

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 修改 | `docs/2_detailed_design_v3.md` | 4处章节更新（S12/S13/G4/G5），无代码变更 |

### 具体修改描述

#### 1.1 S12: LifePlan->Punch 打卡联动路径一致性（间接一致性模型注释）

- **当前状态**: 诊断确认代码正确——LifePlan 打卡通过 `POST /api/punch` 写后端，Punch 列表通过 `GET /api/punch/list` 从后端读，两套独立状态通过后端 API 串联。后端 `POST /api/punch` 的 HTTP 201 契约保证写入在响应返回前已持久化。
- **修改内容**: 在设计文档数据流章节（4.2节或相关章节）中补充一条注释:
  - (a) LifePlan 内打卡与 Punch 列表展示采用间接一致性模型（consistency = eventual, via backend API）
  - (b) 后端 `POST /api/punch` 的 HTTP 201 契约保证写入在响应返回前已持久化
  - (c) 前端从 LifePlan 打卡后立即跳转 Punch 页面时，`GET /api/punch/list` 可读取到最新记录
- **边界条件**: 不修改代码；注释应标注为设计说明而非待办项。

#### 1.2 S13: 路由守卫 requiresDisclaimer 策略不一致

- **当前状态**: 诊断确认代码完全符合设计文档——Punch 路由仅设置 `meta: { requiresAuth: true }`，与设计文档 1.6.2 节免责声明拦截流程说明一致（Punch 不在所列路由中）。但 Punch 页面展示 AI 生成的分析内容（依从性评语、改进建议），与免责声明覆盖"AI生成内容"的原则存在逻辑矛盾。
- **修改内容**: 在设计文档 1.6.2 节免责声明路由列表中增加对 Punch 路由的决策说明:
  - 若团队决定 Punch 需要免责声明: 更新路由列表增加 Punch，并同步修改 `src/router/index.ts`
  - 若团队决定 Punch 不需要免责声明: 注明原因（如"Punch 页面展示的是统计性分析而非生成式AI内容，不触发免责声明要求"）
- **边界条件**: 此条目为设计决策确认，v5 仅完成文档更新注明决策结果；若需代码修改则作为后续轮次的独立任务。

#### 1.3 G4: 双模式并存（Markdown 渲染同步/异步）

- **当前状态**: v4 已通过 G2 任务组（useMarkdown.ts 抽取）完成 Markdown 渲染管道的统一。当前使用 `marked.parse(md, { async: false })` 同步模式，同时代码中已添加 G16 兼容性注释标注未来可能的异步迁移路径。
- **修改内容**: 在设计文档技术选型章节（1.3节或相关章节）中标注:
  - 当前 marked v12 同步模式与未来 v13+ 异步模式为有意并存的双模式策略
  - 同步模式用于当前所有 Markdown 渲染场景（LifePlan 方案内容、Punch AI 分析评语）
  - 异步迁移路径已在 `useMarkdown.ts` 中以 G16 注释标注
- **边界条件**: 不修改代码——诊断确认双模式并存可接受。

#### 1.4 G5: LifePlan 打卡弹窗交互顺序

- **当前状态**: 诊断确认代码实现优于设计文档规定——代码先弹窗收集用户确认再调 API（避免取消后的无效请求），设计文档流程图为先 API 后弹窗。
- **修改内容**: 更新设计文档 4.3 节 LifePlan.vue 流程图，将步骤顺序调整为:
  ```
  点击打卡按钮 -> SweetAlert2 确认弹窗 -> POST /api/punch -> 乐观更新 completedMap
  ```
- **边界条件**: 不修改代码——仅更新文档流程图顺序以匹配更优实现。

### 验收标准

- [ ] **AC-1: S12 注释已添加** — 设计文档数据流章节中包含 LifePlan->Punch 间接一致性模型注释，注明 HTTP 201 契约保证。
- [ ] **AC-2: S13 决策已记录** — 设计文档 1.6.2 节免责声明路由列表中已增加 Punch 路由的决策说明（含或不含免责声明）。
- [ ] **AC-3: G4 双模式已标注** — 设计文档技术选型章节中标注 marked 同步/异步双模式为有意并存。
- [ ] **AC-4: G5 流程图已更新** — 设计文档 4.3 节 LifePlan.vue 流程图打卡弹窗顺序已调整为"先弹窗后 API"。
- [ ] **AC-5: 无代码变更** — `git diff` 仅显示 `docs/2_detailed_design_v3.md` 变更，无 .vue/.ts 文件修改。

---

## 任务组 G2: 全局 CSS 提取 -- G24 (page-enter 动画) + G25 (.press 交互类)

- **问题编号**: G24 + G25
- **严重程度**: 低（代码组织 / UI 完善）
- **预估工时**: 1-2h
- **前置依赖**: 无
- **批处理理由**: 两者均属全局样式提取，共享同一个新建/扩展的全局样式文件，一次重构统一处理。

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| **新建/扩展** | `src/styles/animations.css`（或扩展现有 `src/styles/variables.css`） | 全局动画 + 交互类定义 |
| 修改 | `src/views/Home.vue` | 删除 scoped 中的 `page-enter` 定义，模板增加 `class="home-page"` 锚点 |
| 修改 | `src/views/LifePlan.vue` | 删除 scoped 中的 `page-enter` 和 `.press` 定义 |
| 修改 | `src/views/Punch.vue` | 删除 scoped 中 `.press` 定义（如有）；`page-enter` class 已存在于模板，无需修改模板 |

### 具体修改描述

#### 2.1 全局动画差异分析

提取 `page-enter` 动画到全局样式前，需识别 Home.vue 和 LifePlan.vue 的当前动画效果差异——两者同名但效果不同:

| 页面 | `page-enter` 当前效果 | 关键帧 |
|------|---------------------|--------|
| Home.vue | `fadeIn` + `translateY(8px -> 0)`（淡入+上滑，位移 8px） | `@keyframes pageEnter { opacity + transform: translateY }` |
| LifePlan.vue | 纯 `fadeIn`（仅 opacity 0->1） | `@keyframes fadeIn { opacity }` |

**采用方案C（推荐）**: 全局基础 `fadeIn` + Home 组件级覆盖 `translateY`——全局定义纯 `fadeIn` 动画基础类 `.page-enter`，Home.vue 在 `<style scoped>` 中通过组合选择器 `.page-enter.home-page` 追加 `translateY` 覆盖。此方案保留两页面各自的动画效果不变，全局样式提取不产生副作用。

#### 2.2 新建/扩展全局样式文件

在 `src/styles/` 目录下新建或扩展全局样式文件（如 `src/styles/animations.css`），不含 `scoped` 属性:

```css
/* ===== 页面入场动画（全局基础: 纯淡入） ===== */
@keyframes pageEnter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.page-enter {
  animation: pageEnter 0.4s ease-out;
}

/* ===== 按钮按下态交互（全局） ===== */
.press:active {
  transform: scale(0.96);
  transition: transform 0.1s;
}
```

确保此全局样式文件在 `main.ts` 或 `App.vue` 中被正确引入（不被 scoped 限制）。检查 `src/styles/` 目录现有文件结构，选择扩展现有全局样式文件或新建独立文件。

#### 2.3 修改 `src/views/Home.vue`

(a) 模板: 在根元素上增加 `class="home-page"` 作为覆盖锚点（如根元素已有唯一类名，可使用已有类名）。

(b) `<style scoped>`: 删除 `page-enter` 动画定义和 `@keyframes pageEnter` 关键帧。

(c) `<style scoped>`: 追加 Home 专属的 `translateY` 覆盖:
```css
/* Home.vue scoped — 在全局 fadeIn 基础上追加 translateY 上滑效果 */
.page-enter.home-page {
  animation-name: pageEnterHome;
}

@keyframes pageEnterHome {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

#### 2.4 修改 `src/views/LifePlan.vue`

(a) `<style scoped>`: 删除本地的 `page-enter` / `@keyframes fadeIn` 定义。

(b) `<style scoped>`: 删除本地的 `.press:active` 定义（现已由全局样式提供）。

#### 2.5 修改 `src/views/Punch.vue`

(a) `<style scoped>`: 删除本地的 `.press:active` 定义（如有定义）。

(b) 模板无需修改——`class="page-enter"` 已存在，全局样式自动生效。

### 边界条件

- **动画效果回归**: Home.vue 应保持 `fadeIn + translateY(8px)` 上滑效果，LifePlan.vue 应保持纯 `fadeIn` 效果，Punch.vue 应获得 `fadeIn` 效果（此前动画不生效）。
- **全局样式加载顺序**: 全局样式文件应在 scoped 样式之前加载（或在 `main.ts` 中 import 于 App.vue 之前），确保 `.page-enter` 基础类可用。若 Home.vue 的覆盖样式在 scoped 中，Vue 的 scoped 样式优先级高于全局样式，覆盖可正常生效。
- **`.press` 按钮兼容性**: 确认 LifePlan.vue 和 Punch.vue 中使用 `.press` 类的按钮在全局样式下仍有点击缩放效果。如果某组件内 `.press` 有附加样式（如背景色、边框），保留在 scoped 中不动，仅删除 `:active { transform: scale(0.96) }` 重复定义。
- **动画时长一致性**: Home 旧 `pageEnter` 动画时长可能与全局定义的 0.4s 不同，需确认 Home.vue scoped 中的覆盖动画 `pageEnterHome` 的时长是否为当前值（检查旧代码中的 `animation-duration`）。

### 验收标准

- [ ] **AC-1: Punch 页面入场动画生效** — 进入 `/profile/punch` 页面，检查是否有淡入动画效果（此前动画不生效）。
- [ ] **AC-2: Home 保持淡入+上滑** — Home 页面入场时仍有 `fadeIn + translateY(8px)` 动画效果，与提取前一致。
- [ ] **AC-3: LifePlan 保持纯淡入** — LifePlan 页面入场时仍为纯 `fadeIn` 效果（无位移），与提取前一致。
- [ ] **AC-4: 按钮按下态缩放正常** — LifePlan 和 Punch 页面中按钮点击按下态 `scale(0.96)` 效果正常。
- [ ] **AC-5: 编译验证** — `npx vue-tsc --noEmit` 无新增编译错误；无未使用 CSS 类名警告（scoped 中删除的定义已无引用残留）。

---

## 任务组 G3: LifePlan 修复 -- G1 (CSS/文案对齐) + G11 (表单校验)

- **问题编号**: G1 + G11
- **严重程度**: G1 低（设计对齐）/ G11 低（边界条件）
- **预估工时**: 1-2.5h（G1 1-2h + G11 0.3-0.5h）
- **前置依赖**: 无硬依赖。建议 G2（全局 CSS）之后执行——G2 提取 `.press` 后 LifePlan.vue 样式已稳定。
- **与 G2 的文件级协调**: G2 和 G3 均修改 LifePlan.vue 的 `<style scoped>` 区。建议 G2 先完成（删除重复的 CSS 定义），G3 在此基础上调整。

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 修改 | `src/views/LifePlan.vue` | G1: 空态按钮文案 + CSS 类名注释；G11: `validateForm()` 校验逻辑 |

### 具体修改描述

#### 3.1 G1: CSS 类名 / 按钮文案对齐

- **设计依据**: 4.1.4 节 LifePlan.vue 组件 DOM 树（第3072行起）使用 `empty-state` 类名，按钮文案为"开始风险预测 / 生成我的生活方案"。
- **代码证据**: `src/views/LifePlan.vue:337-342` — 使用 `lp-empty` 类名，按钮文案"立即定制方案"。

修改内容:

(a) **CSS 类名**: `lp-empty` 保留为有意设计偏离（`lp-*` 前缀为项目统一命名空间），在设计文档中标注或在代码注释中注明对应设计位置: `<!-- 对应设计文档 4.1.4节 empty-state，项目使用 lp- 前缀 -->`。

(b) **按钮文案**: 将"立即定制方案"修改为"生成我的生活方案"以对齐设计文案。若团队确认"立即定制方案"为有意简化，则保持不变并在设计文档中更新。

(c) **图标**: FontAwesome `<i>` 图标替代 `<img>` 插图保持现状——减少静态资源依赖，是可接受的技术选择。

#### 3.2 G11: 表单校验空字符串边界

- **代码证据**: `src/views/LifePlan.vue:158` — `if (form.age == null || form.age < 1 || form.age > 120) return false`：`== null` 宽松判等仅能捕获 `null` 和 `undefined`，无法捕获空字符串 `''`。
- **诊断说明**: Vue 的 `v-model.number` 在输入框清空时可能产生空字符串而非 `null`，取决于浏览器实现。

修改 `validateForm()` 函数（第157-163行）:

将三个数字字段的空值检查从 `== null` 改为 `!Number.isFinite()`:

```typescript
// 当前（G11 修复前）
if (form.age == null || form.age < 1 || form.age > 120) return false
if (form.height == null || form.height < 50 || form.height > 250) return false
if (form.weight == null || form.weight < 20 || form.weight > 300) return false

// 修复后
if (!Number.isFinite(form.age) || form.age < 1 || form.age > 120) return false
if (!Number.isFinite(form.height) || form.height < 50 || form.height > 250) return false
if (!Number.isFinite(form.weight) || form.weight < 20 || form.weight > 300) return false
```

**边界条件**: `Number.isFinite(null)` 返回 `false`（null 转 Number 为 NaN），`Number.isFinite('')` 返回 `false`（空字符串转 Number 为 NaN），`Number.isFinite(0)` 返回 `true` 但 0 已被后续 `form.age < 1` 拒绝。所有三条边界均正确。

### 边界条件

- **G1 空态区域**: 仅涉及 `viewMode === 'empty'` 引导态，不影响已加载方案内容的展示。
- **G1 按钮事件**: `lp-empty` 类名修改不影响按钮的 `@click` 事件处理。
- **G11 校验联动**: `validateForm()` 的返回值用于控制表单提交按钮的 `:disabled` 和 `@click` 中的校验门控。修复后 `form.age` 为空字符串时校验失败，按钮保持 disabled，与预期一致。
- **G11 非数字输入**: 用户输入非数字字符（如字母）时 `v-model.number` 产生 `NaN`，`Number.isFinite(NaN)` 返回 `false`，校验正确拦截。

### 验收标准

- [ ] **AC-1: 空态按钮文案** — LifePlan 页面无方案时（`viewMode === 'empty'`），引导按钮文案为"生成我的生活方案"（或确认简化版文案）。
- [ ] **AC-2: CSS 类名注释** — 代码中 `lp-empty` 处有注释标注对应设计文档位置（或设计文档已更新接受 `lp-*` 前缀）。
- [ ] **AC-3: 空字符串校验拦截** — 清空年龄输入框后点击提交，检查是否触发校验提示（而非静默通过）。
- [ ] **AC-4: 零值校验拦截** — 输入 `0` 作为年龄，检查是否被 `form.age < 1` 拒绝。
- [ ] **AC-5: 正常值通过** — 输入合法年龄（如 `35`）/身高（如 `170`）/体重（如 `70`），校验通过，表单可提交。
- [ ] **AC-6: 编译验证** — `npx vue-tsc --noEmit` 无新增编译错误。

---

## 任务组 G4: Home 修复 -- G2 (糖尿病类型"全部"链接) + G9 (接口合并) + G28 (搜索图标)

- **问题编号**: G2 + G9 + G28
- **严重程度**: 低（设计对齐 / 代码组织）
- **预估工时**: 0.9-1.5h（G2 0.3-0.5h + G9 0.3-0.5h + G28 0.3-0.5h）
- **前置依赖**: 无硬依赖。G9 应在 G23（删除 api.ts 死代码）之前执行——G9 合并接口后类型引用关系更清晰。
- **与 G2（全局CSS）的文件级协调**: G2 和 G4 均修改 Home.vue。G2 修改 `<style scoped>`（增删 CSS），G4 修改 `<script setup>` 和 `<template>`。区域不重叠，建议 G2 先于 G4 以稳定样式结构。

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 修改 | `src/views/Home.vue` | G2: "全部"链接；G9: 删除本地接口定义改为 import；G28: 搜索图标行为 |
| 修改 | `src/stores/homeStore.ts` | G9: `DiabetesTypeView` 接口 export |

### 具体修改描述

#### 4.1 G2: 糖尿病类型区"全部"链接

- **设计依据**: 4.1.2 节 Home.vue 组件 DOM 树（第3009行）：`<a>全部</a>` — 为 `<a>` 标签；但设计未定义跳转目标。
- **代码证据**: `src/views/Home.vue:293-295` — 使用 `<span class="section-link-static">`，无点击事件。

**推荐方案（b）**: 保持 `<span>` 占位，在代码中添加注释:
```html
<!-- 全部链接为预留入口，待后续迭代实现糖尿病类型列表页 -->
<span class="section-link-static">全部</span>
```
在设计文档中同步标注"全部链接为预留入口，待后续迭代实现"。

若后续需实现跳转，改为 `<button class="section-link" @click="goTypesList">全部</button>`，跳转目标需确认是否存在对应路由。

#### 4.2 G9: DiabetesTypeView 接口合并

- **代码证据**: `src/views/Home.vue:17-20` 与 `src/stores/homeStore.ts:7-12` 独立定义相同结构的接口。
- **诊断说明**: 两处定义如果不同步修改，TypeScript 不会报错（两个不同的接口定义），存在维护风险。

修改步骤:

(a) `homeStore.ts` 中将 `interface DiabetesTypeView` 前加 `export`:
```typescript
export interface DiabetesTypeView {
  id: number
  name: string
  // ... 其他字段
}
```

(b) `Home.vue` 中删除本地 `DiabetesTypeView` 定义，改为 import:
```typescript
import type { DiabetesTypeView } from '@/stores/homeStore'
```

(c) **合并前验证**: 确保两处接口字段完全一致后合并。若有差异（Store 端可能比组件端多字段），先统一字段再合并。

#### 4.3 G28: 搜索图标行为

- **设计依据**: 4.1.2 节 Home.vue 组件 DOM 树（第2979行）：`<i class="fas fa-search"> (搜索图标, 装饰性)`
- **代码证据**: `src/views/Home.vue:87-98` — 搜索图标绑定了 `@click="onSearch"` 事件，弹出 Toast "搜索功能开发中"。

**推荐方案（a）**: 保留功能占位（`@click="onSearch"` 不变），在设计文档组件树中将"装饰性"标注改为"功能占位（待实现）"。理由是搜索是常见用户预期功能，保留占位提示比空白图标更好的用户体验。

在代码中添加注释说明当前状态:
```html
<!-- 搜索图标——功能占位（待后续迭代实现完整搜索），当前弹出 Toast 提示 -->
<i class="fas fa-search" @click="onSearch"></i>
```

### 边界条件

- **G2 "全部"链接**: 如果后续实现跳转，需确认是否存在糖尿病类型列表路由——当前设计文档未定义此路由，需与产品确认。
- **G9 接口合并**: `import type` 仅用于类型标注，不引入运行时依赖——与常规 `import` 区分。
- **G9 合并后验证**: 若 `homeStore.ts` 中 `DiabetesTypeView` 在 Store 外部被引用（如其他组件），TypeScript 编译会报错确认。
- **G28 搜索图标**: Toast 提示文案"搜索功能开发中"保持现状，不修改交互逻辑。

### 验收标准

- [ ] **AC-1: "全部"链接为占位** — 糖尿病类型区"全部"为 `<span>` 静态文本，旁有注释标注为预留入口。
- [ ] **AC-2: 接口合并无编译错误** — 删除 Home.vue 本地 `DiabetesTypeView` 接口定义后，`npx vue-tsc --noEmit` 无编译错误。
- [ ] **AC-3: 搜索图标保持占位** — 点击搜索图标仍弹出 "搜索功能开发中" Toast。
- [ ] **AC-4: 编译验证** — `npx vue-tsc --noEmit` 无新增编译错误；`import type` 无运行时副作用。

---

## 任务组 G5: Punch 修复 -- G27 (filter 迁移, 前置) -> G13 (onScroll) + G15 (分析提示) + G17 (typeFilter computed) + G29 (返回路径)

- **问题编号**: G27 (前置) + G13 + G15 + G17 + G29
- **严重程度**: 低（代码质量 / UI 完善）
- **预估工时**: 1.7-3h（G27 0.3-0.5h + G13 0.5-1h + G15 0.3-0.5h + G17 0.3-0.5h + G29 0.3-0.5h）
- **前置依赖**: G27 -> G17 为硬依赖（Store 接口变更影响模板访问路径）。G27 -> G13/G15/G29 为建议依赖（避免回修 filter 访问路径）。
- **执行顺序**: G27 必须最先执行（Store 层修改优先原则），G13/G15/G17/G29 在 G27 之后按任意顺序执行（修改 Punch.vue 不同区域，无冲突）。

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 修改 | `src/stores/punchStore.ts` | G27: `filter` 从 reactive 改为 ref |
| 修改 | `src/views/Punch.vue` | G27: 模板中 filter 访问路径更新；G13: onScroll 方案A；G15: 分析范围提示文案；G17: typeFilter ref->computed；G29: router.back() 路径修复 |

### 具体修改描述

#### 5.1 G27 (前置): punchStore.filter reactive -> ref

- **代码证据**: `src/stores/punchStore.ts:19-23` — `const filter = reactive<{ startDate?: string; endDate?: string; punch_type?: PunchType }>({})`
- **诊断说明**: `reactive` 的可变性和 `undefined` 清理语义不如 `ref` + 不可变更新清晰。

修改步骤:

(a) `punchStore.ts` 中将 `filter` 从 `reactive` 改为 `ref`:
```typescript
// 修改前
const filter = reactive<{ startDate?: string; endDate?: string; punch_type?: PunchType }>({})

// 修改后
const filter = ref<{ startDate?: string; endDate?: string; punch_type?: PunchType }>({})
```

(b) `setFilter()` 函数中使用不可变更新:
```typescript
function setFilter(partial: Partial<typeof filter.value>) {
  filter.value = { ...filter.value, ...partial }
}
```

(c) `Punch.vue` 模板中所有 `filter.xxx` 访问改为 `filter.value.xxx`（Vue 模板中 ref 自动解包 `ref.value` -> `filter.xxx` 仍可用，但需确认 Store 解包行为——Pinia 的 `storeToRefs` 或直接使用 `store.filter` 在模板中的解包方式。实际确认: 如果 Punch.vue 中使用 `const store = usePunchStore()` 且未使用 `storeToRefs`，则模板中 `store.filter.xxx` 访问 reactive 的属性 -> ref 后变为 `store.filter.xxx` 自动解包 `.value`，Pinia store 中的 ref 在模板中自动解包，访问路径不变。**需验证: Pinia store 返回的 ref 在模板中是否自动解包**——通常 Pinia store 内 `ref` 在模板中通过 store 实例访问时自动解包 `.value`，因此 `store.filter.startDate` 应仍可工作。若不解包，需改为 `store.filter.value.startDate`。）

**重要——Pinia ref 解包确认**: Pinia store 返回的 `ref` 在 `<script setup>` 中需通过 `.value` 访问，但在 `<template>` 中自动解包（与 Vue 组件的 `ref` 行为一致）。因此模板中 `store.filter.startDate` 在改为 `ref` 后仍然可用，修改影响面主要在 `<script setup>` 中直接访问 `filter` 的代码（如 `fetchList`/`loadMore` 函数内的参数构建逻辑）。

(d) `fetchList`/`loadMore` 函数内部参数构建: 从 `filter.startDate` 改为 `filter.value.startDate`（Store 内部 `.ts` 文件中对 ref 的访问需要 `.value`）。

#### 5.2 G13: onScroll 容器绑定

- **代码证据**: `src/views/Punch.vue:111` — `const { scrollTop, scrollHeight, clientHeight } = document.documentElement`

**采用方案A（推荐——保持文档级滚动，降低布局假设耦合）**: 在 Punch.vue 模板的根元素 `.punch-page` 上增加 `data-scroll-container="punch"` 属性:

```html
<div class="punch-page page-enter" data-scroll-container="punch">
```

`onScroll` 中增加当前页面可见性检查:
```typescript
function onScroll() {
  // 仅在当前页面可见时处理滚动逻辑
  const container = document.querySelector('[data-scroll-container="punch"]')
  if (!container) return

  const { scrollTop, scrollHeight, clientHeight } = document.documentElement
  if (scrollHeight - scrollTop - clientHeight < 100) {
    store.loadMore()
  }
}
```

此方案不改动 CSS 布局和滚动模型，仅降低对 `document.documentElement` 作为"唯一"滚动容器的隐式假设——未来若 Profile 布局改为局部滚动，仅需修改 `data-scroll-container` 对应的 CSS 而无需重写 JS 逻辑。

**不推荐方案B**: 方案B 要求为 `.punch-page` 设置 `height: 100vh` + `overflow-y: auto`，改为组件内局部滚动。此 CSS 变更会影响 G15（分析区提示文案的 DOM 定位基准），增加协调成本。v5 中不采用。

#### 5.3 G15: loadMore 分析范围提示

- **代码证据**: `src/stores/punchStore.ts:92-118` — `loadMore()` 仅拉取更多列表记录；`src/views/Punch.vue:144` — `fetchAnalysis()` 仅在 `onMounted` 中调用一次。
- **诊断说明**: loadMore 增加显示的记录数量后，AI 分析统计仍然基于最初加载时的数据范围。用户在加载更多记录后可能期待分析数据相应更新。

修改: 在分析区上方或下方增加提示文案:

```html
<!-- 在分析区标题或内容附近增加 -->
<p class="analysis-range-hint" v-if="store.analysis">
  分析基于当前筛选范围内的打卡记录
</p>
```

CSS:
```css
.analysis-range-hint {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
  text-align: center;
  margin-top: 8px;
}
```

**边界条件**: 需与后端确认 `GET /api/punch/analysis` 是否始终返回全量统计（不受分页参数影响）。若后端已返回全量分析，提示文案正确描述当前行为。若后端按分页范围返回分析数据，提示文案需调整为"分析基于当前显示的打卡记录"并考虑在 loadMore 后刷新分析。

#### 5.4 G17: typeFilter ref -> computed

- **代码证据**: `src/views/Punch.vue:26` — `const typeFilter = ref<PunchType | undefined>(undefined)` 独立于 `src/stores/punchStore.ts:19-23` 的 `filter.punch_type`
- **诊断说明**: 两处状态的同步依赖 `onTypeFilter()` 函数手动同时更新两者。如果未来有其他代码路径修改 `store.filter.punch_type` 而不经过 `onTypeFilter`，UI 将出现不同步。

修改: 将 `typeFilter` 从 `ref` 改为 `computed`（依赖 G27 完成后 store.filter 接口稳定）:

```typescript
// 修改前
const typeFilter = ref<PunchType | undefined>(undefined)

function onTypeFilter(val: PunchType | undefined) {
  typeFilter.value = val
  store.setFilter({ punch_type: val })
}

// 修改后
const typeFilter = computed<PunchType | undefined>({
  get: () => store.filter.punch_type,
  set: (val: PunchType | undefined) => store.setFilter({ punch_type: val }),
})
```

删除 `onTypeFilter` 函数。模板中 chip 按钮的绑定:
```html
<!-- 修改前 -->
<button @click="onTypeFilter(opt.value)">...</button>

<!-- 修改后 -->
<button @click="typeFilter = opt.value">...</button>
```

#### 5.5 G29: router.back() 返回路径

- **代码证据**: `src/views/Punch.vue:160` — 返回按钮使用 `router.back()` 依赖浏览器历史栈。
- **诊断说明**: Punch 页面可通过多个入口进入（Profile 子路由、LifePlan 跳转、直接 URL），`router.back()` 在不同入口场景下返回不同页面，行为不一致。

修改: 使用命名路由 `router.push('/profile')` 替代 `router.back()`:

```typescript
// 修改前
function goBack() {
  router.back()
}

// 修改后
function goBack() {
  router.push('/profile')
}
```

**设计理由**: 始终返回 Profile 页提供一致的导航体验。`router.back()` 在用户直接访问 `/profile/punch`（历史栈长度为 1）时可能退出应用，`router.push('/profile')` 更安全。若需保留从 LifePlan 跳转后返回 LifePlan 的便利性，可在 query 参数中携带来源信息（如 `/profile/punch?from=lifeplan`），`goBack` 中根据来源决定跳转目标。

### 边界条件

- **G27 Pinia ref 解包**: 需在修改后验证 `<script setup>` 中直接访问 `store.filter` 的代码（`fetchList`/`loadMore` 内部参数构建使用 `filter.value.xxx`），模板中 `store.filter.startDate` 等访问确认 Pinia 自动解包生效。如不解包则需在模板中显式使用 `store.filter.value.startDate`。

- **G13 滚动节流**: 保持现有 `onScroll` 中的节流/防抖逻辑不变。`data-scroll-container` 属性仅用于标识，不引入新 CSS 语义。

- **G15 分析提示**: 仅当 `store.analysis` 存在时展示提示（避免空态展示误导文案）。

- **G17 computed setter**: `computed` 的 setter 在 `typeFilter = undefined`（点击"全部"chip）时，`store.setFilter({ punch_type: undefined })` 清除类型筛选。与当前 `onTypeFilter(undefined)` 行为一致。

- **G29 返回路径**: 如果其他代码依赖 Punch 页面返回时的历史栈行为（如测试用例期望 `router.back()` 被调用），需同步更新。

### 验收标准

- [ ] **AC-1: filter ref 迁移** — 修改日期筛选后 `store.filter.startDate` 正确更新；`fetchList()` 请求参数中包含正确的日期和类型筛选值。
- [ ] **AC-2: 滚动加载更多** — 滚动到底部仍自动触发 `loadMore()`，列表追加记录。
- [ ] **AC-3: 分析范围提示** — 分析区展示"分析基于当前筛选范围内的打卡记录"提示文案。
- [ ] **AC-4: typeFilter 双向绑定** — 点击类型 chip 切换筛选，chip 高亮、列表数据、`store.filter.punch_type` 三者一致。
- [ ] **AC-5: typeFilter 外部同步** — 通过其他路径修改 `store.filter.punch_type`（如 URL 参数恢复），chip 高亮自动同步（computed getter 生效）。
- [ ] **AC-6: 返回按钮路径一致** — 从 LifePlan 进入 Punch 后点击返回，跳转至 `/profile`（而非 `/life-plan`）；从 Profile 进入 Punch 后点击返回，跳转至 `/profile`（行为一致）。
- [ ] **AC-7: 编译验证** — `npx vue-tsc --noEmit` 无新增编译错误；`onTypeFilter` 函数删除后无未使用变量警告。

---

## 任务组 G6: Store 安全 -- G10 (riskFormStore 运行时类型守卫)

- **问题编号**: G10
- **严重程度**: 低（安全加固）
- **预估工时**: 0.3-0.5h
- **前置依赖**: 无
- **与其他组的文件级协调**: 仅修改 `riskFormStore.ts`，与 G5（punchStore.ts）/ G8（homeStore.ts/lifePlanStore.ts）无共享文件。

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 修改 | `src/stores/riskFormStore.ts` | `loadFromStorage()` 函数（第45-70行）: 增加值类型校验 |

### 具体修改描述

#### 6.1 riskFormStore loadFromStorage() 类型守卫

- **代码证据**: `src/stores/riskFormStore.ts:45-70` — `loadFromStorage()` 仅做字段名白名单过滤（`allowedKeys`），不做值类型校验。
- **诊断说明**: sessionStorage 的 JSON 序列化/反序列化循环中，`v-model.number` 清空后重新赋值时，类型污染可能发生（如 `age` 可能被存为字符串 `"25"` 而非数字 `25`）。

修改: 在 `loadFromStorage()` 的字段恢复循环中增加类型校验:

```typescript
// 数字字段列表
const NUMBER_FIELDS = ['age', 'height', 'weight', 'waist', 'systolic_bp']

// 枚举字段及其允许值
const ENUM_FIELDS: Record<string, Set<string>> = {
  gender: new Set(['male', 'female']),
  diabetes_history: new Set(['none', 'prediabetes', 'diagnosed']),
  family_history: new Set(['none', 'one', 'multiple']),
  diabetes_type: new Set(['type1', 'type2', 'gestational', 'other']),
}

function loadFromStorage() {
  try {
    const raw = sessionStorage.getItem('risk_form_data')
    if (!raw) return
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return

    const allowedKeys = new Set([...NUMBER_FIELDS, ...Object.keys(ENUM_FIELDS), /* 其他字段 */])

    for (const key of Object.keys(data)) {
      if (!allowedKeys.has(key)) continue

      const value = data[key]

      // 数字字段: 强制转换为 number
      if (NUMBER_FIELDS.includes(key)) {
        const num = Number(value)
        if (Number.isFinite(num)) {
          (formData as any)[key] = num
        }
        // 类型校验失败 -> 静默丢弃（设为 undefined，不影响整体恢复）
        continue
      }

      // 枚举字段: 校验值是否在允许集合中
      if (ENUM_FIELDS[key]) {
        if (typeof value === 'string' && ENUM_FIELDS[key].has(value)) {
          (formData as any)[key] = value
        }
        // 不在允许集合中 -> 静默丢弃
        continue
      }

      // 其他字段: 直接赋值（保持原有逻辑）
      (formData as any)[key] = value
    }
  } catch {
    // 解析失败时静默降级，不影响功能
  }
}
```

### 边界条件

- **类型校验失败静默丢弃**: 将脏数据字段设为 `undefined` 而非抛出错误——单个字段的类型污染不应阻止整体数据恢复。
- **数字字段的合法零值**: `age: 0` 通过 `Number.isFinite(0)` -> `true`，但表单层的业务校验（`age < 1`）会在提交时拦截，不依赖此处。
- **枚举字段大小写**: 枚举值校验使用 `===` 精确匹配（如 `'type1'` 而非 `'Type1'`），如需大小写不敏感校验则改为 `.toLowerCase()` 比较。
- **向后兼容**: 未在 `NUMBER_FIELDS` 和 `ENUM_FIELDS` 中列出的字段按原有逻辑（直接赋值）处理，不受影响。

### 验收标准

- [ ] **AC-1: 数字字段类型恢复** — 在 sessionStorage 中手动修改 `risk_form_data` 的 `age` 值为字符串 `"25"`，刷新页面后检查 `formData.age` 是否被正确转为数字 `25`。
- [ ] **AC-2: 枚举字段校验** — 将 `gender` 改为 `"invalid"`，检查恢复后 `formData.gender` 是否为 `undefined`（脏数据被丢弃）。
- [ ] **AC-3: 合法数据正常恢复** — 正常填写表单后刷新页面，所有字段值正确恢复，无丢失。
- [ ] **AC-4: 空 storage 不崩溃** — sessionStorage 中无 `risk_form_data` 键时，`formData` 保持默认值，不报错。
- [ ] **AC-5: 编译验证** — `npx vue-tsc --noEmit` 无新增编译错误。

---

## 任务组 G7: 类型清理 -- G23 (api.ts 死代码) + G26 (enumLabel 类型约束)

- **问题编号**: G23 + G26
- **严重程度**: 低（代码质量）
- **预估工时**: 0.6-1h（G23 0.3-0.5h + G26 0.3-0.5h）
- **前置依赖**: 建议 G9（接口合并）之后执行——G9 合并 DiabetesTypeView 后类型引用更清晰，G23 删除死代码时不易误删仍在使用的类型。

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 修改 | `src/types/api.ts` | G23: 删除未使用的泛型类型定义 |
| 修改 | `src/utils/enumLabels.ts` | G26: 增加 `as const satisfies` 类型约束 |

### 具体修改描述

#### 7.1 G23: api.ts 死代码删除

- **代码证据**: `src/types/api.ts:2-31` — 定义了 `ApiResponse<T>`/`ApiError`/`PaginatedResponse<T>` 三个泛型类型，但 API composable 均使用内联类型，未引用这些泛型。
- **诊断说明**: 类型定义存在但从未被引用，属于死代码。

修改步骤:

(a) 全文搜索 `ApiResponse`、`ApiError`、`PaginatedResponse` 在项目中的引用:
```bash
grep -r "ApiResponse\|ApiError\|PaginatedResponse" src/
```
确认仅在 `api.ts` 中定义，无外部引用。

(b) 删除 `ApiResponse<T>` 和 `PaginatedResponse<T>` 定义（保留 `ApiError` 用于类型标注，如有引用）。

(c) 若 `ApiError` 也无外部引用，一并删除。

(d) 在 api.ts 文件顶部添加注释说明 API 类型采用内联定义策略:
```typescript
/**
 * API 类型定义
 *
 * 类型策略: API composable 采用内联类型定义每个接口的响应结构，
 * 更好地表达每个端点的具体契约。不使用泛型包装器（ApiResponse<T> 等）。
 */
```

#### 7.2 G26: enumLabel 映射表类型约束

- **代码证据**: `src/utils/enumLabels.ts:1` — `Record<string, Record<string, string>>` 类型过宽，`LABELS.punch_type.die` 这样的拼写错误不会产生编译错误。
- **诊断说明**: 使用 `as const satisfies` 可收紧类型约束。

修改:

```typescript
// 修改前
const LABELS: Record<string, Record<string, string>> = {
  gender: { ... },
  family_history: { ... },
  // ...
}

// 修改后
const LABELS = {
  gender: {
    male: '男',
    female: '女',
  },
  family_history: {
    none: '无',
    prediabetes: '糖尿病前期',
    diagnosed: '已确诊',
  },
  // ... 其他分类
} as const satisfies Record<string, Record<string, string>>
```

**边界条件**: `as const` 后 `LABELS` 的类型变为深度只读，但 `enumLabel` 函数仅读取不写入，不影响功能。此外，`enumLabel` 函数的返回类型可能需适配——`as const` 后字面量类型收窄为具体字符串字面量联合类型（如 `'男' | '女'`），函数返回类型应兼容。

验证 `enumLabel` 函数签名是否兼容:
```typescript
export function enumLabel(category: string, value: string): string {
  return LABELS[category]?.[value] ?? value
}
```
`LABELS[category]?.[value]` 在 `as const` 后仍可索引，返回类型为 `string | undefined`，`?? value` 后为 `string`——兼容。

### 边界条件

- **G23 删除验证**: 删除前必须全文搜索确认无外部引用。若存在引用则改为替换引用或保留。
- **G23 替代方案**: 若团队后续希望统一使用泛型，则不删除 `ApiResponse<T>` 等，而是重构 API composable 使用泛型——但此方案工作量更大，建议作为独立 Task 在后续轮次处理。
- **G26 `as const satisfies` 兼容性**: 此语法要求 TypeScript 4.9+，确认项目 tsconfig 中 `target` 不低于 ES2015（`as const` 需求）——当前项目已使用 TypeScript 5.x，完全兼容。

### 验收标准

- [ ] **AC-1: 死代码无残留** — `ApiResponse`/`PaginatedResponse` 从 `api.ts` 中删除后，`npx vue-tsc --noEmit` 无编译错误。
- [ ] **AC-2: enumLabel 类型错误检测** — 在代码中故意使用错误键名（如 `LABELS.punch_type.die`），检查 TypeScript 是否产生编译错误（`as const satisfies` 生效）。
- [ ] **AC-3: enumLabel 正常功能** — 现有 `enumLabel('gender', 'male')` 等调用仍正常返回中文映射。
- [ ] **AC-4: 编译验证** — `npx vue-tsc --noEmit` 无新增编译错误。

---

## 任务组 G8: Store 一致性（可选，可推迟至 v6）-- G18 (竞态保护) + G19 (命名) + G20 (error粒度) + G21 (loading粒度) + G22 (retry签名)

- **问题编号**: G18 + G19 + G20 + G21 + G22
- **严重程度**: 低（代码质量 / 技术债务）
- **预估工时**: 2.7-5h（G18 1-2h + G19 0.5-1h + G20 0.3-0.5h + G21 0.5-1h + G22 0.3-0.5h）
- **前置依赖**: 无硬依赖。建议 G5（Punch 修复，含 G27 Store 接口变更）之后执行——G5 完成后三个 Store 的修改区域更清晰。
- **可推迟至 v6 的理由**: 5个子任务均属代码质量/风格改进，不涉及功能缺陷。当前 P4 代码修复（G2-G7）已有 7-11.5h，若工时紧张可将本组推迟至 v6。
- **Store 层依赖关系**: 本组 5 个子任务均修改 Store 文件（homeStore.ts / lifePlanStore.ts / punchStore.ts）。lifePlanStore.ts 被 G19/G20/G22 三个维度同时修改，强烈建议由同一开发者集中完成（一站式重构），避免多人并行修改同一文件导致的合并冲突。

### 涉及文件

| 操作 | 文件路径 | 说明 |
|:----:|---------|------|
| 修改 | `src/stores/homeStore.ts` | G18: pageInstanceId 竞态保护；G21: loading 拆分 |
| 修改 | `src/stores/lifePlanStore.ts` | G18: requestId 竞态保护；G19: `generate`->`createPlan`/`adjust`->`updatePlan`；G20: 合并 error 字段；G22: 统一 retry 签名 |
| 修改 | `src/views/LifePlan.vue` | G19: 重命名后的调用点更新；G20: error ref 名更新 |
| 修改 | `src/views/Home.vue` | G21: loading ref 拆分后模板适配 |

### 具体修改描述

#### 8.1 G18: 竞态保护扩展（homeStore + lifePlanStore）

- **背景**: S9（v1 已完成）为 punchStore 的三个 action 实现了 requestId 快照模式。G18 需将该模式扩展到 homeStore 和 lifePlanStore。

**(a) homeStore.fetchHomeData() — pageInstanceId 快照**:

`fetchHomeData` 使用 `Promise.allSettled` 同时发出 3 个请求。使用**整体丢弃策略**（page instance token）——三个请求要么全部采用、要么全部丢弃:

在 `homeStore.ts` 中:
```typescript
// 在 useHomeStore 函数体内、fetchHomeData 之前声明
let pageInstanceId = 0

async function fetchHomeData(): Promise<void> {
  const pageToken = ++pageInstanceId  // 入口递增

  loading.value = true
  // ... clear errors ...

  const [docRes, artRes, typeRes] = await Promise.allSettled([...])

  // 三个请求完成后统一检查，过期则整体丢弃
  if (pageToken !== pageInstanceId) return

  // ... 回填数据到对应的 ref ...
  loading.value = false
}
```

**(b) lifePlanStore — requestId 快照**:

为 `fetchCurrent()`、`generate()`、`adjust()` 三个 action 增加 requestId 快照保护（复用 punchStore 的同模式）:

```typescript
// 在 useLifePlanStore 函数体内声明
const requestId = ref(0)

async function fetchCurrent(): Promise<void> {
  const snapshot = ++requestId.value
  // ... 请求逻辑 ...
  if (snapshot !== requestId.value) return
  // ... 回填数据 ...
}

async function generate(req: GenerateRequest): Promise<void> {
  const snapshot = ++requestId.value
  // ... 请求逻辑 ...
  if (snapshot !== requestId.value) return
  // ... 回填数据 ...
}

async function adjust(req: AdjustRequest): Promise<void> {
  const snapshot = ++requestId.value
  // ... 请求逻辑 ...
  if (snapshot !== requestId.value) return
  // ... 回填数据 ...
}
```

#### 8.2 G19: Store action 命名统一

按以下对照表重命名 lifePlanStore 的 action:

| Store | 当前名称 | 建议名称 | 理由 |
|-------|---------|---------|------|
| lifePlanStore | `generate()` | `createPlan()` | `create` 更精确表达 POST 创建语义 |
| lifePlanStore | `adjust()` | `updatePlan()` | `update` 为 CRUD 标准动词 |

`retryGenerate`/`retryAdjust` 待 G22 统一签名时一并处理（见 8.5）。

重命名涉及:
- `lifePlanStore.ts` 中的函数定义
- `LifePlan.vue` 中所有调用点（模板 `@click` 和 `<script setup>`）
- 如有其他文件引用这些 action，一并更新

#### 8.3 G20: Store error 字段粒度统一

**lifePlanStore 合并**: 当前 `error`(fetchCurrent) / `generateError`(generate) / `adjustError`(adjust) — 按操作拆分。建议合并 `generateError` 和 `adjustError` 为 `mutationError`:

```typescript
// 修改前
const error = ref<string | null>(null)           // fetchCurrent 错误
const generateError = ref<string | null>(null)   // generate 错误
const adjustError = ref<string | null>(null)     // adjust 错误

// 修改后
const fetchError = ref<string | null>(null)      // fetchCurrent 错误
const mutationError = ref<string | null>(null)   // generate/adjust 共用错误
```

模板中同步更新: `v-if="store.generateError"` -> `v-if="store.mutationError"`（含对应 `.message` 引用）。

**homeStore / punchStore**: 当前已符合按资源拆分策略，保持不变。

#### 8.4 G21: Store loading 字段粒度对齐

**homeStore**: 将单一 `loading` 拆分为 `doctorsLoading`/`articlesLoading`/`typesLoading` 三个独立 ref + 一个聚合 computed:

```typescript
// 三个独立 loading ref
const doctorsLoading = ref(false)
const articlesLoading = ref(false)
const typesLoading = ref(false)

// 聚合 computed（首屏整体骨架屏用）
const loading = computed(() =>
  doctorsLoading.value || articlesLoading.value || typesLoading.value
)
```

`fetchHomeData` 中在各 `Promise.allSettled` 分支中设置对应 `*Loading`:
```typescript
const [docRes, artRes, typeRes] = await Promise.allSettled([...])

// 无论成功/失败，settled 后对应 loading 结束
doctorsLoading.value = false
articlesLoading.value = false
typesLoading.value = false
```

重试方法中仅设置对应 `*Loading`:
```typescript
async function retryDoctors(): Promise<void> {
  doctorsLoading.value = true
  try { ... } catch { ... } finally { doctorsLoading.value = false }
}
```

Home.vue 模板适配: 首屏骨架屏 `v-if="store.loading"` 保持不变；各区块增加独立 loading 指示器用于重试场景（可选，非必须——`loading` computed 已在任一区块 loading 时为 true）。

**lifePlanStore / punchStore**: 当前粒度已合理，保持不变。

#### 8.5 G22: Store retry* 方法签名统一

采用**统一无参模式**: `retryXxx(): Promise<void>`。

对于 `retryGenerate(req)` 这类需要请求参数的场景，在 `generate()` 函数中将参数缓存到 Store:

```typescript
// lifePlanStore.ts
const lastGenerateReq = ref<GenerateRequest | null>(null)

async function generate(req: GenerateRequest): Promise<void> {
  lastGenerateReq.value = req  // 缓存参数
  // ... 请求逻辑 ...
}

async function retryGenerate(): Promise<void> {
  if (!lastGenerateReq.value) return
  // 重放缓存的参数
  await generate(lastGenerateReq.value)
}
```

类似地处理 `retryAdjust`。模板中重试按钮的调用从 `@click="store.retryGenerate(someReq)"` 简化为 `@click="store.retryGenerate()"`。

### 边界条件

- **G18 pageInstanceId**: `let pageInstanceId = 0` 在 store 函数体内（Pinia setup 语法），非模块顶层。每次调用 `useHomeStore()` 创建新实例时 `pageInstanceId` 从 0 开始——这与 Pinia store 的单例模式一致（store 实例不销毁，`pageInstanceId` 持续递增）。若组件卸载后重新挂载触发新一轮请求，递增的 pageInstanceId 正确使旧请求失效。
- **G19 重命名**: 搜索项目中所有 `generate`/`adjust` 的引用（`grep -r "\.generate\|\.adjust" src/`），确保无遗漏调用点。
- **G20 error 合并**: `mutationError` 在 `generate` 开始时清空，失败时填充——`adjust` 同理。两者共享同一 error ref 意味着同一时间仅展示最近一次 mutation 的错误，这符合用户预期（不会同时看到两个 mutation 错误）。
- **G21 loading 拆分**: `loading` computed 自动聚合三个独立 loading——首屏行为不变。重试场景下 `retryDoctors` 设置 `doctorsLoading=true`，`loading` computed 自动为 `true`，整体骨架屏不出现但医生区块可展示独立 spinner。
- **G22 lastGenerateReq**: `lastGenerateReq` 仅缓存最近一次 `generate` 调用的参数，不持久化到 sessionStorage/localStorage——页面刷新后丢失，与 form 数据生命周期一致。

### 验收标准

- [ ] **AC-1: homeStore 竞态保护** — 快速切换 Home 页面（挂载->卸载->挂载），检查旧页面请求的响应是否被丢弃（不污染新页面的 Store 状态）。
- [ ] **AC-2: lifePlanStore 竞态保护** — 快速重复点击"生成方案"按钮，检查仅最后一次请求的响应用于更新状态。
- [ ] **AC-3: action 命名更新** — `generate`->`createPlan`/`adjust`->`updatePlan` 后，LifePlan.vue 模板和脚本中所有调用点正常工作。
- [ ] **AC-4: error 字段合并** — 生成方案失败和调整方案失败均设置 `mutationError`，错误提示正常展示。
- [ ] **AC-5: loading 拆分** — Home 页面加载时，三个区块可独立展示 loading 状态（如重试单个区块时不影响其他区块）。
- [ ] **AC-6: retry 签名统一** — 所有 `retry*` 方法为无参调用，重试按钮 `@click` 无需传递参数。
- [ ] **AC-7: 编译验证** — `npx vue-tsc --noEmit` 无新增编译错误；重命名后的所有引用无未定义函数错误。

---

## G14-phase2 切换状态确认（v5 开始前）

v2-r1 审查建议 R3 和 v4-r2 建议 L3 跟踪了 G14（API success 字段拦截器）的两阶段部署状态:

| 阶段 | 状态 | 说明 |
|:---:|------|------|
| Phase 1（当前） | `console.warn` 日志收集 | G14 响应拦截器中使用 `console.warn` 记录所有 `success: false` 响应，不 reject |
| Phase 2（待切换） | `Promise.reject` 错误抛出 | 将 `console.warn` 替换为 `Promise.reject(err)`，触发 Store catch 链和 UI 错误提示 |

**v5 跟进安排**:

1. 在 v5 开始前确认 G14 当前阶段（Phase 1 或 Phase 2）。
2. 若仍为 Phase 1（console.warn）:
   - 检查日志收集是否已充分（建议至少一个迭代周期，约 1-2 周）。
   - 若已收集足够日志且无误报，安排切换至 Phase 2 作为 v5 或 v6 的首个任务。
   - 若日志量不足或存在误报，继续 Phase 1 并在 v6 中重新评估。
3. 若已切换至 Phase 2:
   - 确认无回归问题（所有 API 正常调用不受影响）。

---

## 跨轮次依赖就绪确认

| 前置依赖 | 来自轮次 | 状态 | 对 v5 的影响 |
|---------|:------:|:----:|------------|
| S9 (fetchAnalysis 竞态保护) | v1 | **已完成** | G18 复用同一 requestId 模式扩展到 homeStore/lifePlanStore。 |
| G14 (success 拦截器) | v2 | **Phase 1 (console.warn)** | v5 不直接依赖 G14，但 G14-phase2 切换状态需在 v5 开始前确认。 |
| S5b-1/S5b-2 (chatStore SSE) | v3 | **已完成** | 无交叉依赖。v5 的 Store 修改（homeStore/lifePlanStore/punchStore）与 chatStore 完全独立。 |
| G7 (useMarkdown.ts) | v4 | **已完成** | v5 G4（设计文档更新）引用 marked 同步/异步双模式，与 G7 创建的 useMarkdown.ts 一致。 |
| G12/S10 (sanitize.ts) | v4 | **已完成** | 无直接依赖。G4（设计文档更新 G4 条目）引用 DOMPurify + marked 技术组合，sanitize.ts 提供加固实现。 |
| G3/G6 (环形图/刷新按钮) | v4 | **已完成** | v5 排除 G3/G6。Punch.vue 当前模板结构（含环形图 + 刷新按钮）为 G5（Punch 修复）的基线。 |

**结论**: 所有跨轮次硬性依赖已满足。v5 可以立即开始。

---

## 文件修改清单

| 文件 | G1 | G2 | G3 | G4 | G5 | G6 | G7 | G8 | 操作 | 预估行数 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|------|:------:|
| `docs/2_detailed_design_v3.md` | ++ | | | | | | | | 修改（4处章节更新） | ~30行 |
| `src/styles/animations.css` | | ++ | | | | | | | **新建/扩展** | ~20行 |
| `src/views/Home.vue` | | + | | + | | | | + | 修改（CSS删除+接口合并+链接+搜索+loading模板） | ~20行净增 |
| `src/views/LifePlan.vue` | | + | + | | | | | + | 修改（CSS删除+文案+校验+命名+error模板） | ~15行净增 |
| `src/views/Punch.vue` | | + | | | ++ | | | | 修改（CSS删除+filter路径+scroll+提示+typeFilter+返回） | ~30行净增 |
| `src/stores/punchStore.ts` | | | | | + | | | | 修改（filter reactive->ref） | ~5行 |
| `src/stores/homeStore.ts` | | | | + | | | | ++ | 修改（接口export + pageInstanceId + loading拆分） | ~25行净增 |
| `src/stores/lifePlanStore.ts` | | | | | | | | ++ | 修改（requestId + 命名 + error合并 + retry签名） | ~30行净增 |
| `src/stores/riskFormStore.ts` | | | | | | + | | | 修改（类型守卫） | ~20行净增 |
| `src/types/api.ts` | | | | | | | + | | 修改（删除死代码） | ~10行净减 |
| `src/utils/enumLabels.ts` | | | | | | | + | | 修改（as const satisfies） | ~2行 |
| **合计** | ~30 | ~20 | ~15 | ~20 | ~60 | ~20 | ~12 | ~55 | — | **~232行** |

> **修改协调说明**:
> - **LifePlan.vue** 被 G2/G3/G8 三个任务组修改: G2 删除 scoped 中的 CSS 定义，G3 修改空态按钮文案和校验函数，G8 更新 action 名称和 error ref 引用。三处修改在文件的不同区域（style / template / script），建议按 G2 -> G3 -> G8 顺序执行。
> - **Home.vue** 被 G2/G4/G8 三个任务组修改: G2 删除 scoped 中的 CSS 定义，G4 修改接口 import 和"全部"链接和搜索图标，G8 适配 loading 拆分后的模板。建议按 G2 -> G4 -> G8 顺序执行。
> - **Punch.vue** 被 G2/G5 两个任务组修改: G2 删除 scoped 中的 `.press` 定义，G5 修改 filter 访问路径/scroll/typeFilter/返回路径/分析提示。修改区域不重叠（style vs template+script），按 G2 -> G5 顺序执行。
> - **homeStore.ts** 被 G4/G8 两个任务组修改: G4 仅增加 `export` 关键字（1行），G8 增加 pageInstanceId + loading 拆分。建议 G4 先于 G8 或由同一开发者顺序完成。
> - **lifePlanStore.ts** 仅被 G8 修改（4个维度一站式重构），无跨组冲突。

---

## 风险提示

1. **punchStore filter reactive->ref 对模板引用路径的影响未验证**（概率: 中，影响: 中）: Pinia store 中的 `ref` 在 Vue 模板中理论上自动解包 `.value`，但需在修改后实际验证 `store.filter.startDate` 等模板引用是否仍正常工作。如果 Pinia store 的 ref 在模板中不解包，则需批量替换为 `store.filter.value.startDate`。**缓解措施**: G27 完成后立即启动应用验证筛选功能（日期选择 -> 日期筛选 -> 类型筛选），确认 filter 值读取和写回正确后再继续 G13/G15/G17。

2. **G5 (Punch 修复) 与 G2 (全局 CSS) 的 Punch.vue 共享修改**（概率: 低，影响: 低）: G2 删除 Punch.vue scoped 中的 `.press` 定义，G5 修改 Punch.vue 的 template/script。两处修改在不同区域（style vs template+script），但如果在不同分支上并行，git 合并时可能出现格式冲突（相邻行编辑导致 diff 上下文重叠）。**缓解措施**: G2 先于 G5 执行，或由同一开发者顺序完成。

3. **G8 (Store 一致性) 的 lifePlanStore.ts 4维度并发修改**（概率: 中，影响: 中）: lifePlanStore.ts 被 G18 (requestId 快照)、G19 (重命名 `generate`/`adjust`)、G20 (合并 error)、G22 (统一 retry 签名) 四个维度同时修改。任何一处修改的符号重命名都会影响其他维度的代码引用。**缓解措施**: 强烈建议 G8 的 lifePlanStore.ts 修改由同一开发者在一次代码重构中一站式完成，顺序为 G18 -> G19 -> G20 -> G22（先加保护机制，再做命名/接口重构，最后统一 retry 签名）。

4. **G14-phase2 切换时机不确定**（概率: 低，影响: 低）: 如果 G14 仍为 Phase 1 (console.warn)，API `success: false` 响应仍被静默传递 `null` 到 Store，各页面的错误提示不会因后端业务错误而触发。v5 的 Store 修改（G8）不依赖 G14 的阶段状态，但若 G14 在 v5 执行期间切换至 Phase 2，可能引入新的错误提示 UX 需要验证。**缓解措施**: v5 开始前明确 G14 当前阶段状态；若 v5 执行期间切换 G14，v5 完成后增加一次全页面冒烟验证（Home/LifePlan/Punch 各页面的错误态 UI）。

5. **工时膨胀风险（G8 可选组）**（概率: 中，影响: 中）: G8 (Store 一致性) 预估 2.7-5h，lifePlanStore.ts 的一站式重构是关键耗时项。若 v5 核心交付（G1-G7，9-13.5h）已接近工时上限，G8 推迟至 v6 不影响功能完整性。**缓解措施**: 在 v5 执行开始时就 G8 的纳入做出明确决策（纳入 or 推迟至 v6），避免执行途中犹豫导致上下文切换成本。

---

## 补充建议（来自审查报告，非阻塞）

| 编号 | 建议 | 来源 | 本文件采纳情况 |
|:--:|------|------|:------------:|
| S1 | 将 v3 可推迟项（~8h）拆分为独立轮次 v6，不并入 v5 | 审查报告维度三 | **已采纳** — 范围裁定明确推迟至 v6 |
| S2 | G14-phase2 切换在 v5 开始前确认状态 | v4-r2 L3 跟踪 | **已采纳** — 见"G14-phase2 切换状态确认"节 |
| S3 | homeStore/lifePlanStore/punchStore 的多维度修改建议由同一开发者集中完成 | 审查报告维度三 | **已采纳** — G8 执行顺序和协调说明中标注 |
| S4 | Punch.vue 的两个任务组修改（G2 全局样式 + G5 模板修复）按 G2->G5 顺序 | 审查报告维度三 | **已采纳** — 文件修改清单中标注 |
| S5 | plan.md 的 v5 工时（7-12h -> 9-13.5h）和条目数（~15 -> 24 问题/18 代码修复）同步更新 | v4-r2 L1 跟踪 | 建议在 v5 完成后同步更新 plan.md |
| S6 | G27->G17 硬依赖在任务文件中显式标注 | 审查报告批准条件3 | **已采纳** — G5 前置依赖和执行顺序中标注 |

---

*第5轮任务文件结束。下一轮 v6 将处理: v3 可推迟项（断线重连指数退避 + 多医生路由 + fabOpen + Markdown 增强，约 8h）及 G8 推迟项（Store 一致性，约 2.7-5h，如 v5 未完成）。*
