# 设计审查报告（v1 r1）

## 审查结果
APPROVED

## 发现

### 1. **[轻微]** — `LoginResponse` 类型与注册后端响应的结构性偏差

设计文档"类型定义"节将注册响应的 `res.data.data` 结构映射为 `LoginResponse`（`src/types/api.ts:47-52`），其中 `user: LoginUser` 要求 `{ id, username, role, avatar }`。但后端 `POST /api/auth/register`（`server/routes/auth.js:38-45`）实际返回的 user 对象为 `{ id, username, avatar: null }`，缺少 `role` 字段（role 仅存在于顶层 `data.role`）。

**影响评估**：不影响编译和运行。原因：(1) `api.post` 返回类型为 `any`（axios 默认），解构出的 `user` 也是 `any`；(2) `authStore.setAuth(token, role, user)` 调用时 `user` 以 `any` 传入 `LoginUser` 形参，TypeScript 允许 `any` 赋值给任意类型；(3) 这与现有 `handleLogin` → `authStore.login` 的 `any` 传播模式完全一致，属于项目既有惯例。

**建议**：可在设计文档中注明 "user 对象不含 role 字段，setAuth 调用时 user 经 any 传播不触发类型错误"，避免后续维护者误以为后端 register 响应完全符合 `LoginUser` 契约。无需修改代码。

### 2. **[轻微]** — 注册按钮样式缺少 `px-` 说明

设计文档"注册表单模板详述"中按钮 class 为 `w-full bg-[#4A90D9] text-white py-3 rounded-xl font-medium hover:bg-[#3A7BC8] transition disabled:opacity-50`，不含水平 padding。现有登录按钮同样不含 `px-`，依赖 `w-full` 撑满宽度。虽与现有完全一致，但长文本（如"注册中..."）可能紧贴按钮边缘。

**影响评估**：与现有登录按钮样式完全一致，属于既有风格选择，不引入新问题。

**建议**：可忽略。若后续统一优化按钮 padding，登录/注册按钮应同步调整。

## 审查依据

- 需求覆盖：对照 `requirement.md` B1 的 9 条实现要求逐条验证，全部覆盖。
- 任务范围：对照 `task_v1.md` 仅修改 `src/views/Login.vue` 一个文件的约束，设计严格遵守。
- 代码一致性：
  - `api` 导入路径 `@/composables/useApi` 正确（`useApi.ts` 具名导出 `api`）。
  - `authStore.setAuth(token: string, role: 'user'|'admin', user: LoginUser)` 签名与调用匹配。
  - 错误访问路径 `err?.response?.data?.error?.message` 正确：后端 `error()` 返回 HTTP 4xx + `{ error: { code, message } }`，axios 4xx 走 error handler 保留原始 `err.response.data`。
  - `validateRegister` 8 条校验规则完整对齐需求。
  - 模板 Tailwind class 与现有登录表单完全一致。
  - `v-show` 选择理由充分（保留表单状态）。
  - `switchView` 清空目标视图错误的逻辑覆盖。
  - `safeRedirect` 复用不变。
- 可编码性：设计提供了精确的 ref 定义（名称/类型/初始值）、完整的函数签名含 JSDoc 和流程描述、逐元素的 DOM 结构与属性绑定、所有样式 class。实施者无需任何额外推断即可直接编码。
