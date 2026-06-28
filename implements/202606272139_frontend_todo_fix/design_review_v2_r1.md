# 第2轮详细设计审查报告 R1

> **审查对象**: `detail_v2.md`（第2轮修复详细设计 v2）
> **审查基线**: 诊断报告 `a_v8_diag_v3.md`、任务文件 `task_v2.md`、详细设计文档 `2_detailed_design_v3.md`
> **审查日期**: 2026-06-27
> **审查结论**: **APPROVED（含 3 项标注建议）**

---

## 1. 审查维度总览

| 审查维度 | 结论 | 严重度 |
|---------|:----:|:-----:|
| 1. 任务设计与诊断报告一致性 | 通过（1 项偏差已说明） | 中 |
| 2. 修改方案具体可编码性 | 通过 | -- |
| 3. S8 localStorage→sessionStorage 迁移完整性 | 通过（1 项计数标注） | 低 |
| 4. S8 clearAuth 联动正确性（循环依赖） | 通过 | -- |
| 5. G14 拦截器对现有 10 个 API 函数兼容性 | 通过 | -- |

---

## 2. 维度 1: 任务设计与诊断报告一致性

### 2.1 G14 -- 分阶段策略偏差

**发现**: `detail_v2.md` 1.3 节的分阶段部署策略与诊断报告建议存在差异。

| 来源 | Phase 1 行为 | Phase 2 行为 |
|------|-------------|-------------|
| 诊断报告 G14 (第572-574行) | `console.warn` 仅记录日志，**不 reject**。收集 1-2 周确认无误报。 | 切换为 `Promise.reject`（移除 console.warn） |
| task_v2.md (第84-88行) | `console.warn` 日志收集版本，确认无误报后切换 | 切换为 reject |
| **detail_v2.md (第106-108行)** | **`console.warn` + `Promise.reject` 同时生效** | 移除 `console.warn`（保留 reject） |

detail_v2 在 Phase 1 同时实施 warn 和 reject，理由是"确保错误被 Store catch 块捕获、用户看到错误提示"。这跳过了诊断报告建议的纯日志收集期（warn-only without reject），存在以下风险：

- 若后端存在 `success: false + data: null` 的合法空态场景（如诊断报告第573行提到的 `GET /api/plan/current` 无方案时的边界情况），Phase 1 会直接 reject 并触发错误 UI，而非仅记录日志。
- 诊断报告第573行明确列出了日志收集期间受影响的三条 UI 路径（Home 首页三段、LifePlan 空态、Punch 分析面板），并建议团队评估"1-2 周的静默 null 窗口期是否可接受"。

**判定**: 此偏差在 detail_v2 中已有明确说明和理由（第106-108行"两者同时生效而非互斥"段落）。这是一个有意识的设计决策而非遗漏。但**标注建议 A**：修复者应在提交代码时附带说明——若上线后出现误报（合法空态被拦截为错误），回退方案为在拦截器中增加白名单逻辑（特定 API + 特定 message 组合不 reject），而非整体回退 G14。

### 2.2 S4+S11 -- 优先级方向与 task_v2 内部矛盾消解

**发现**: `task_v2.md` 内部 S4 和 S11 对 `diabetesType` 优先级存在自相矛盾：

- S4 (第129行): "`route.query.diabetesType` 如有值则优先覆盖 `result.matched_diabetesType`"
- S11 (第160行): "优先使用 result 数据（更权威）"

诊断报告中 S4 (第118行) 建议 query > result，S11 (第340行) 建议 result > query，存在同样的内部矛盾。

`detail_v2.md` 第437行（3.7 节决策表）明确选择了 **result > query** 方向，理由是"`riskForm.result` 来自后端 API 响应（含 `record_id`），比 URL query 参数更权威、更难伪造"。同时提供了完整回退链：result 缺失时自动退至 query，query 缺失时不展示提示条。

**判定**: 消解合理。**标注建议 B**：确保 `riskForm.loadFromStorage()` 在 `prefillFromRiskForm()` 中确实被调用（当前代码第76行确认已调用），且 `isValidResult` 校验通过后 result 才不为 null——这是 detail_v2 第428行边界条件表所列的前提，修复时需验证 `riskFormStore.ts` 中 `loadFromStorage()` 的实现确保 result 字段被正确水合。

### 2.3 S6、S4、S11、S8 -- 与诊断报告一致

- **S6**: 诊断报告第193-197行的修复建议（改为 `router.push({ path: '/news/article/' + id })` + 防御 `if (!id) return`）在 detail_v2 第191-203行完整覆盖。
- **S4**: 诊断报告第117-120行建议在 `onMounted` 中 `prefillFromRiskForm()` 后读取 `riskForm.result`，detail_v2 第341-357行完整覆盖。
- **S11**: 诊断报告第338-340行建议新增 `diabetesTypeHint` computed 并扩展模板提示条，detail_v2 第317-335行完整覆盖。
- **S8**: 诊断报告第236-288行的修复方案（16处迁移 + 5处保留 + BC 增强）在 detail_v2 第467-691行完整覆盖并细化。

---

## 3. 维度 2: 修改方案具体可编码性

全部 5 个任务的修改方案均包含：涉及文件及行号、修改前代码结构、修改后代码完整片段、函数签名变更表、数据流变化图、边界条件枚举表、验证方法。

| 任务 | 核心修改文件 | 代码片段完整度 | 行号精确度 | 可编码性 |
|:----:|------------|:-----------:|:--------:|:------:|
| G14 | `src/composables/useApi.ts` | 完整（第62-101行） | 精确 | 可编码 |
| S6 | `src/views/Home.vue` | 完整（第192-195行） | 精确 | 可编码 |
| S4+S11 | `src/views/LifePlan.vue` | 完整（第305-371行） | 精确 | 可编码 |
| S8 | `src/stores/authStore.ts` | 完整（第467-691行） | 精确（1处偏移） | 可编码 |

### 3.1 S8 行号偏移标注

**标注建议 C**: `detail_v2.md` 第491行标注 `clearMustChangePassword()` 中 `localStorage.removeItem('must_change_password')` 位于第112行，经实际代码验证（`src/stores/authStore.ts` 当前版本）位于**第113行**。偏差为 1 行，不影响编码定位——修复者按函数名 `clearMustChangePassword` 搜索即可定位。

---

## 4. 维度 3: S8 localStorage→sessionStorage 迁移完整性

### 4.1 逐行核验

经逐行比对 `src/stores/authStore.ts`（123行）与 `detail_v2.md` 4.2 节和 4.3.2 节的全部迁移点，确认：

**需迁移至 sessionStorage 的 16 处操作点（全部覆盖）**：

| 键 | 操作点 | 行号 | detail_v2 覆盖 |
|----|--------|:---:|:------------:|
| token | getItem (初始化 ref) | 12 | 4.3.2.1 第539行 |
| role | getItem (初始化 ref) | 13 | 4.3.2.1 第540行 |
| user | getItem (初始化 ref) | 17 | 4.3.2.1 第541行 |
| token | setItem (setToken) | 32 | 4.3.2.2 第550行 |
| token | setItem (setAuth) | 39 | 4.3.2.3 第575行 |
| role | setItem (setAuth) | 40 | 4.3.2.3 第576行 |
| user | setItem (setAuth) | 41 | 4.3.2.3 第577行 |
| token | getItem (syncFromStorage) | 45 | 4.3.2.4 第593行 |
| role | getItem (syncFromStorage) | 46 | 4.3.2.4 第594行 |
| user | getItem (syncFromStorage) | 49 | 4.3.2.4 第597行 |
| token | removeItem (clearAuth) | 70 | 4.3.2.5 第630行 |
| role | removeItem (clearAuth) | 71 | 4.3.2.5 第631行 |
| user | removeItem (clearAuth) | 72 | 4.3.2.5 第632行 |
| user | setItem (fetchProfile) | 100 | 4.3.2.6 第668行 |
| role | setItem (fetchProfile) | 101 | 4.3.2.6 第669行 |
| user | setItem (setProfile) | 108 | 4.3.2.7 第678行 |

**保留在 localStorage 的 5 处操作点（全部标注）**：

| 键 | 操作点 | 行号 | detail_v2 覆盖 |
|----|--------|:---:|:------------:|
| must_change_password | getItem (初始化 ref) | 25 | 4.3.2.1 第543行 |
| must_change_password | getItem (syncFromStorage) | 62 | 4.3.2.4 第614行 |
| must_change_password | removeItem (clearAuth) | 73 | 4.3.2.5 第646行 |
| must_change_password | setItem (login) | 83 | 4.2 第487行 |
| must_change_password | removeItem (clearMustChangePassword) | 113 | 4.2 第491行 |

**结论**: 21 处全部覆盖，迁移清单完整。**仅有一处内部计数标注偏差**：detail_v2 第494行摘要写 "token: 6处, role: 4处, user: 6处"，实际为 "token: 5处, role: 5处, user: 6处"。总数 16 处正确，不影响编码。

### 4.2 login() 函数间接迁移确认

`login()` (第76-85行) 本身不含 token/role/user 的直接 localStorage 操作——它通过调用 `setAuth()` (第80行) 间接完成 token/role/user 的三个 setItem。`setAuth()` 已在迁移清单中。`login()` 内仅有的 localStorage 操作是 `must_change_password` (第83行)，已标注保留。login() 无需额外修改。 ✓

### 4.3 其他文件的 localStorage 保留确认

| 文件 | 键 | 操作 | 处理 |
|------|-----|------|------|
| `src/router/index.ts:85` | `disclaimer_accepted` | getItem | 保留，不迁移（detail_v2 4.6节） |
| `src/router/index.ts:125` | `disclaimer_accepted` | setItem | 保留，不迁移（detail_v2 4.6节） |

注：detail_v2 第751行引用 router 第125行，经实际代码验证，`disclaimer_accepted` 的 setItem 位于第125行，getItem 位于第85行。引用准确。

---

## 5. 维度 4: S8 clearAuth 联动正确性（避免循环依赖）

### 5.1 联动清理实现分析

`detail_v2.md` 4.3.2.5 节（第616-649行）的 clearAuth 修改方案：

```typescript
function clearAuth() {
  // ... 状态清空 + sessionStorage.removeItem ...

  // 联动清理
  try { useHomeStore().clearHomeCache() } catch { /* Store 未初始化时静默 */ }
  try { useLifePlanStore().clearPlanCache() } catch { /* Store 未初始化时静默 */ }

  // BC 广播
  getBcChannel()?.postMessage({ type: 'AUTH_CHANGED', token: null, ... })
}
```

### 5.2 循环依赖分析

**调用链**：
```
useApi.ts (401 handler) → authStore.clearAuth() → useHomeStore() / useLifePlanStore()
```

**模块导入关系**：
```
authStore.ts ──import──→ homeStore.ts (useHomeStore factory)
authStore.ts ──import──→ lifePlanStore.ts (useLifePlanStore factory)
homeStore.ts ──import──→ authStore.ts (useAuthStore factory)
lifePlanStore.ts ──import──→ authStore.ts (useAuthStore factory)
```

形成 `authStore.ts ↔ homeStore.ts` 和 `authStore.ts ↔ lifePlanStore.ts` 的双向模块导入。

**安全性评估**:
1. ES 模块系统对循环导入有内置支持——模块导出绑定在循环引用中不会被截断为 undefined（与 CommonJS 不同）。
2. 关键点：`import { useHomeStore }` 导入的是一个**工厂函数**，而非 store 实例。模块顶层不调用 `useHomeStore()`。
3. 实际的 store 实例在 `clearAuth()` **运行时**通过 `useHomeStore()` 动态获取——此时 Pinia 已完全安装，所有 store 均已注册。
4. `try-catch` 提供防御性保护——即使边缘情况下 store 未初始化，也不会阻断 `clearAuth()` 的主体逻辑。

**判定**: 循环依赖存在但是安全的。在 Pinia + Vite (ES modules) 环境下，这种跨 store 调用模式是官方推荐做法。

### 5.3 联动清理触发场景审计

| 触发场景 | 调用方 | 是否合理 |
|---------|--------|:------:|
| 用户主动登出 | `logout()` → `clearAuth()` | 是 — 旧用户缓存应清除 |
| 401 拦截器触发 | `useApi.ts` error handler → `clearAuth()` | 是 — Token 失效后缓存数据属于旧用户 |
| 跨标签页 BC 广播 | `onmessage` → `clearAuth()` | 是 — 其他标签页登出，本标签页同步清除 |
| `syncFromStorage()` 读取失败 | token/role 为空 → `clearAuth()` | 是 — 无有效认证信息时清除缓存 |

全部合理，无冗余或遗漏。

---

## 6. 维度 5: G14 拦截器对现有 10 个 API 函数兼容性

### 6.1 Error 对象兼容性审计

detail_v2 构造的 Error 对象结构：
```typescript
const err = new Error(res.data.message || '请求失败') as Error & { response?: { data?: { message?: string } } }
err.response = { data: { message: res.data.message } }
```

此 Error 对象经过以下路径：

1. **axios 响应拦截器** → `Promise.reject(err)` → 进入调用方的 `.catch()` 块
2. **Store catch 块**（3 个 Store，共 10 个 try-catch）:
   - homeStore: `Promise.allSettled` → rejected promise reason → `docRes.reason instanceof Error ? docRes.reason : new Error(...)`
   - lifePlanStore: `catch (e) → e instanceof Error ? e : new Error(...)`
   - punchStore: 同上模式
3. **getErrorMessage 提取**:
   - `LifePlan.vue:102-109`: `'response' in err → err.response?.data?.message`
   - `Punch.vue:63-77`: 相同模式

**兼容性验证**: 构造的 Error 对象满足 `instanceof Error`（通过 Store 直通）、具有 `response` 属性（getErrorMessage 提取后端消息），与所有 10 个函数兼容。诊断报告第569-570行已完成相同的逐函数审计并得出相同结论。

### 6.2 各函数受影响行为模拟

| 场景 | API 响应 | 修改前行为 | 修改后行为 |
|------|---------|-----------|-----------|
| 正常成功 | `{ success: true, data: [...] }` | 透传 | 透传（`!res.data.success` = false，跳过检查） |
| 业务错误 | `{ success: false, data: null, message: "限流" }` | null 静默传递到 Store | reject → catch 块 → error ref 回填 → UI 错误提示 |
| 旧版 API（无 success 字段） | `{ data: [...] }` | 透传 | `typeof res.data.success === 'boolean'` = false，跳过检查 |
| res.data 为 null | `null` | 运行时错误 | `res.data &&` 短路，跳过检查 |
| HTTP 409 (generatePlan) | `{ success: false, ... }` + 409 | axios error 分支 | **走 axios error 分支**，不受 success 检查影响 |
| HTTP 401 | `{ ... }` + 401 | axios error → clearAuth | **走 axios error 分支**，不受 success 检查影响 |

### 6.3 generatePlan 409 路径确认

`generatePlan()` 返回 HTTP 409 时，axios 将其视为错误响应（status >= 400），进入拦截器的 error 回调（第82行 `(err) => {}`），不经过 success 回调（第64行 `(res) => {}`）。因此 G14 的 success 检查不拦截 409 场景。lifePlanStore.generate() 中现有的 409 特殊处理（`e.response?.status === 409`）继续正常工作。 ✓

---

## 7. 其他发现

### 7.1 S8 BroadcastChannel 实现比诊断报告方案更完整

detail_v2 的 BC 实现（第501-530行）相比诊断报告第257-286行的最小方案有以下改进：

| 特性 | 诊断报告 | detail_v2 |
|------|:------:|:--------:|
| 懒初始化 | `getChannel()` 函数 | `getBcChannel()` 函数（同模式） |
| onmessage 注册 | 模块顶层 if(bc) | 懒初始化内，首次调用时注册 |
| clearAuth 广播携带 null | 是 | 是（token: null） |
| 状态就绪检查 | `token.value` 非空检查 | **无**（接收方直接 setAuth 或 clearAuth） |

**注意**: detail_v2 的 onmessage 回调（第512-518行）在收到 `AUTH_CHANGED` 且 token 非空时调用 `setAuth()`，收到 null token 时调用 `clearAuth()`。这与诊断报告 v5 修正的"增加状态就绪检查"有差异——detail_v2 不检查本地 `token.value` 是否为空就直接执行同步。在以下场景可能产生多余调用：
- 标签页 B 已登录，收到标签页 A 的 `AUTH_CHANGED` (token 相同) → 调用 `setAuth()` 覆盖相同的值 → 多余但无害。
- 标签页 B 正在登录中（token 即将被设置），收到标签页 A 的广播 → `setAuth()` 可能覆盖并重写 sessionStorage → 极低概率竞态，且两端 token 通常一致。

**判定**: 差异影响极小，不构成风险。但**标注建议 D**（见第 8 节）——可在 onmessage 中增加 `if (d.token !== token.value)` 快照比较以跳过无变化的同步。

### 7.2 与计划审查 R2 建议的符合性

`detail_v2.md` 第806-807行（计划审查建议处置表）：
- R1 (移除 G14 的"建议前置 S9"标注): detail_v2 第104行明确标注"此标注已确认不成立"，符合 ✓
- R2 (clearAuth 内动态获取 Store 实例): detail_v2 第651行采纳，在 clearAuth 内部通过 `useXxxStore()` 动态获取，避免模块顶层 Store 实例依赖，符合 ✓
- R3 (v3 计划增加 G14-phase2 跟进项): detail_v2 第108行和第38行标注 G14-phase2 为跟进项，符合 ✓

### 7.3 文件修改行数预估合理性

| 来源 | G14 | S6 | S4+S11 | S8 | 合计 |
|------|:--:|:--:|:-----:|:--:|:---:|
| task_v2.md | 12 | 5 | 25 | 40 | 82 |
| detail_v2.md | 15 | 5 | 30 | 55 | 105 |

detail_v2 在第798行解释了增幅原因（console.warn 多行格式化、新增 4 个 computed/reactive、BC 完整实现扩展），说明合理。

---

## 8. 标注建议汇总

| 编号 | 类型 | 位置 | 内容 | 处置建议 |
|:----:|------|------|------|---------|
| A | 风险提示 | G14 1.3节 | Phase 1 同时实施 warn+reject 跳过了纯日志收集期。若上线后出现误报（合法空态被拦截为错误），回退方案为增加白名单逻辑而非整体回退 G14。建议提交时附带此说明。 | 确认采纳，修复时附带此回退预案注释 |
| B | 验证提醒 | S4+S11 3.6节 | `riskForm.result` 数据水合依赖 `loadFromStorage()` 中的 `isValidResult` 校验。修复后需验证该路径在 Risk 页完成预测→跳转 LifePlan 场景下的数据完整性。 | 修复后按 detail_v2 3.8 节验证方法执行 |
| C | 行号修正 | S8 4.2节 | `clearMustChangePassword()` 中 `localStorage.removeItem('must_change_password')` 实际位于第113行（非第112行）。差异 1 行，不影响编码。 | 修复时按函数名搜索定位即可 |
| D | 优化建议 | S8 4.3.1节 | BC onmessage 回调可增加 `if (d.token !== token.value)` 快照比较，跳过无变化的认证同步以减少多余 sessionStorage 写入。 | 可选优化，不影响功能正确性 |

---

## 9. 审查结论

**APPROVED（含 3 项标注建议）**

全部 5 个任务（G14、S6、S4、S11、S8）的详细设计满足可编码性要求：

1. 与诊断报告高度一致（G14 分阶段策略偏差已明确说明且回退方案清晰）；
2. 修改方案均为逐行精确代码片段，修复者可直接按行号定位并修改；
3. S8 的 21 处 localStorage 操作点全部被识别和迁移覆盖（16 处迁移 + 5 处保留），无遗漏；
4. S8 clearAuth 联动清理方案通过 Pinia 动态实例获取避免了循环依赖死锁风险；
5. G14 构造的 Error 对象与全部 10 个 API 函数及 3 个 Store 的 catch 链路兼容，无需修改 Store 层代码。

批准进入编码实施阶段。建议修复者关注标注 A 和 B，其余标注为可选优化。

---

*审查报告结束（R1）。*
