# 任务指令（v1）

## 动作
NEW

## 任务描述
在 `src/views/Login.vue` 新增注册视图（用户名/密码/确认密码 + 前端校验 + `POST /api/auth/register` 调用），保留现有登录表单功能完全不变。登录/注册通过本地 `view` ref（'login' | 'register'）切换，不走路由。

预期涉及文件：
- `src/views/Login.vue` — 修改（新增注册视图 + 切换逻辑）

## 选择理由
B1 完全独立，仅修改 1 个文件，与 D1/D3 共享的 chatStore.ts/types/sse.ts 无任何交集。优先推进可建立首个 PASS/FAIL 节点，降低后续 D1/D3 共享文件冲突时的排查面。

## 任务上下文

### 设计依据
- 登录视图与注册视图在同一页面切换，注册视图默认隐藏
- 注册表单字段：用户名（3-50字符，全局唯一）+ 密码（≥8位，含字母和数字）+ 确认密码 + 错误提示 + 提交按钮
- 切换链接：注册视图底部"已有账号？立即登录"

### 后端 API
- `POST /api/auth/register`（`server/routes/auth.js:11-47`）
- 请求体：`{ username, password }`
- 注册成功返回（HTTP 201）：`{ success: true, data: { token, role: 'user', user: { id, username, avatar } }, message }`
- 失败返回：409（用户名已存在）/ 422（校验错误），错误结构 `{ success: false, error: { message } }`

### 实现要求
1. 在 `src/views/Login.vue` 添加注册视图，保留现有登录表单功能完全不变
2. 登录/注册视图切换（本地 `view` ref: 'login' | 'register'），通过点击切换链接切换，不走路由
3. 注册表单校验：用户名必填（3-50字符）、密码必填（≥8位含字母和数字）、确认密码必填且与密码一致
4. 校验失败显示 `regErrorMsg`（字段级错误提示，复用现有登录错误的样式风格）
5. 调用 `POST /api/auth/register` —— 通过 `useApi` 的 `api` 实例（走 axios 拦截器，baseURL `/api`，与 authStore.login 一致）。参考 authStore.login 的 `api.post('/auth/login', ...)` 调用模式。register 响应结构为 `{success, data:{token, role, user}, message}`（success 包装），需从 `res.data.data` 取 token/role/user
6. 注册成功后：调用 `authStore.setAuth(data.token, data.role, data.user)` 完成自动登录 → `router.replace(safeRedirect(route.query.redirect))`（复用现有 safeRedirect 开放重定向防护）
7. 注册失败（用户名已存在返回 409 / 校验错误 422）：显示后端错误消息（`err?.response?.data?.error?.message || '注册失败'`）
8. 保持现有 Tailwind 样式风格与配色（`#4A90D9` 主色）
9. 切换视图时清空对应错误信息

## 已有代码上下文

### Login.vue 当前结构（`<script setup lang="ts">` + Tailwind）
- 本地 ref：`username`、`password`、`errorMsg`、`loading`
- 调用 `useAuthStore()` 获取 `authStore`
- `handleLogin()`：前端校验 → `authStore.login(username, password)` → `router.replace(safeRedirect(...))` → catch 显示 `errorMsg`
- `safeRedirect(target)`：开放重定向防护，仅允许相对路径
- 模板：`<form @submit.prevent="handleLogin">`，输入框用 `v-model`，错误消息 `<p v-if="errorMsg">`
- 底部：`<router-link to="/login">立即注册</router-link>`（自环链接，需改为切换触发）
- 样式：Tailwind utility classes，`bg-[#4A90D9]` 主色按钮

### authStore.ts 关键接口
- `authStore.login(username, password)` — 调用 `api.post('/auth/login', ...)`，从 `res.data.data` 取 `{ token, role, user }`，调用 `setAuth(token, role, user)` 完成登录
- `authStore.setAuth(token, role, user)` — 设置 token/role/user 到 sessionStorage + store state
- `authStore.register` — **不存在**，需在 Login.vue 中直接调用 `api.post('/auth/register', ...)` 后手动调用 `setAuth`

### useApi.ts
- 导出 `api`（axios 实例，baseURL `/api`，含请求拦截器自动注入 Authorization header、响应拦截器处理 `success: false` 为 rejection）
- 导入方式：`import { api } from '@/composables/useApi'`

### 构建验证
- 命令：`npm run build:client`（执行 `vue-tsc -b && vite build`）
- 本项目无单元测试框架，验证以 vue-tsc 类型检查 + vite 构建通过为准
