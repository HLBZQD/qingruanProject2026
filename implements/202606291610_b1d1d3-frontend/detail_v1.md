# 详细设计（v1）

## 概述

在 `src/views/Login.vue` 中新增注册视图，与现有登录视图在同一页面内通过本地 `view` ref 切换（不走路由）。注册表单包含用户名、密码、确认密码三个字段及前端校验，调用 `POST /api/auth/register` 接口，成功后自动登录并跳转。保留现有登录表单的所有功能、样式和交互完全不变。

**范围**：仅 `src/views/Login.vue` 一个文件，不涉及任何新文件创建或其他文件修改。

## 文件规划

| 文件路径 | 操作 | 职责 |
|---------|------|------|
| `src/views/Login.vue` | 修改 | 新增注册视图（ref/v-model/computed/methods/模板），保留现有登录表单功能完全不变 |

## 类型定义

### 本任务复用已有类型，不新增类型文件

本任务涉及的请求体和响应数据结构均已由 `src/types/api.ts` 定义：

| 类型 | 文件 | 用途 |
|------|------|------|
| `LoginUser` | `src/types/api.ts:40-45` | `setAuth()` 参数 `newUser` 的类型，含 `id: number; username: string; role: 'user' \| 'admin'; avatar: string \| null` |
| `RegisterRequest` | `src/types/api.ts:35-38` | 注册请求体契约 `{ username: string; password: string }`，`api.post('/auth/register', body)` 的 body 参数隐式符合此类型 |
| `LoginResponse` (内联) | `src/types/api.ts:47-52` | 注册成功时 `res.data.data` 的结构：`{ token: string; role: 'user' \| 'admin'; user: LoginUser }`（注册不返回 `must_change_password`） |

**后端注册响应完整结构**（基于 `server/routes/auth.js:11-47`）：
```typescript
// HTTP 201 成功
{
  success: true,
  data: {
    token: string,       // JWT token
    role: 'user',        // 注册固定为 'user'
    user: {
      id: number,
      username: string,
      avatar: string | null
    }
  },
  message: string
}

// HTTP 409 / 422 失败
{
  success: false,
  error: {
    message: string      // 如 "用户名已存在" / 校验错误描述
  }
}
```

**设计决策**：不给注册响应单独定义 `RegisterResponse` 类型。原因是 (1) 注册响应 data 结构与 `LoginResponse` 一致（`token + role + user`），(2) 本项目类型策略为 "API composable 采用内联类型"，任务不创建新 composable，在 Login.vue 中直接调用 `api.post` 并用 `any` 标注 catch 中 err 即可（与现有 `handleLogin` 风格一致），(3) 不引入不会复用的单点类型。

## 组件设计：Login.vue

### `<script setup lang="ts">` 接口定义

#### 新增 import

```typescript
import { api } from '@/composables/useApi'
```

**说明**：`authStore.login()` 内部已封装 `api.post('/auth/login', ...)`，但 `authStore` 无 `register` 方法，因此需要直接导入 `api` 实例调用注册接口。`api` 的 axios 拦截器已自动处理 Authorization header 注入（注册时无 token，请求头不注入）和 `success: false` rejection。

**保留 import**（不变）：
```typescript
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
```

#### 新增响应式状态（ref）

| ref 名称 | 类型 | 初始值 | 职责 |
|----------|------|--------|------|
| `view` | `Ref<'login' \| 'register'>` | `'login'` | 当前视图模式，控制登录/注册表单显隐 |
| `regUsername` | `Ref<string>` | `''` | 注册用户名输入，v-model 绑定 |
| `regPassword` | `Ref<string>` | `''` | 注册密码输入，v-model 绑定 |
| `regPasswordConfirm` | `Ref<string>` | `''` | 注册确认密码输入，v-model 绑定 |
| `regErrorMsg` | `Ref<string>` | `''` | 注册错误提示文本，模板中用 `v-if="regErrorMsg"` 条件渲染 |
| `regLoading` | `Ref<boolean>` | `false` | 注册提交中状态，控制按钮 disabled + 文案 |

#### 新增函数签名

```typescript
/**
 * 切换登录/注册视图，并清空目标视图的错误信息。
 * 点击"立即注册"与"立即登录"链接时调用。
 * @param mode - 目标视图标识
 */
function switchView(mode: 'login' | 'register'): void

/**
 * 注册表单前端校验。
 * 校验规则（按顺序，遇第一个失败即返回）：
 *   1. 用户名必填（!regUsername.value）
 *   2. 用户名字符数限制（length < 3 || length > 50）
 *   3. 密码必填（!regPassword.value）
 *   4. 密码长度 ≥ 8（length < 8）
 *   5. 密码必须包含字母（!/[a-zA-Z]/.test(...)）
 *   6. 密码必须包含数字（!/[0-9]/.test(...)）
 *   7. 确认密码必填（!regPasswordConfirm.value）
 *   8. 确认密码与密码一致（!== regPassword.value）
 * @returns 错误描述字符串，校验通过返回 null
 */
function validateRegister(): string | null

/**
 * 注册表单提交处理（@submit.prevent 绑定）。
 * 执行流程：
 *   1. 调用 validateRegister() 前端校验，失败 → 设置 regErrorMsg 并 return
 *   2. 设置 regLoading = true，regErrorMsg = ''
 *   3. await api.post('/auth/register', { username: regUsername.value, password: regPassword.value })
 *   4. 从 res.data.data 解构 { token, role, user }
 *   5. 调用 authStore.setAuth(token, role, user) 完成登录
 *   6. router.replace(safeRedirect(route.query.redirect)) 跳转
 *   7. catch: regErrorMsg = err?.response?.data?.error?.message || '注册失败'
 *   8. finally: regLoading = false
 * @returns Promise<void>
 */
async function handleRegister(): Promise<void>
```

#### 保留函数（完全不变）

| 函数 | 说明 |
|------|------|
| `safeRedirect(raw: unknown): string` | 开放重定向防护，仅允许相对路径 |
| `handleLogin(): Promise<void>` | 登录表单提交处理（源码一字不改） |

#### 保留 computed / 解构（完全不变）

```typescript
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const username = ref('')
const password = ref('')
const errorMsg = ref('')
const loading = ref(false)
```

### `<template>` 模板变更

#### 结构重组策略

使用 `v-show="view === 'login'"` / `v-show="view === 'register'"` 控制两组视图的显示/隐藏。选择 `v-show` 而非 `v-if` 的理由：(1) 设计文档标注注册容器 "默认隐藏"，即始终存在于 DOM，(2) 用户在切换时不丢失已填写的表单内容，用户体验优于销毁重建。

#### 登录视图（修改点：切换链接）

现有登录表单整体用 `<div v-show="view === 'login'">` 包裹（最外层从 `<div class="min-h-screen ...">` 改为仅包裹登录视图区域），或将 `v-show` 加在现有最外层 `<div>` 上配合注册区域。

**推荐的 DOM 结构**：

```
<div class="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center px-6">
  <div class="w-full max-w-sm">

    <!-- ===== 登录视图 ===== -->
    <div v-show="view === 'login'">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-[#4A90D9]">糖尿病预治智能助手</h1>
        <p class="text-sm text-gray-400 mt-2">登录您的账号</p>
      </div>

      <form class="space-y-4" @submit.prevent="handleLogin">
        <!-- 现有输入框和按钮，完全不变 -->
      </form>

      <p class="text-center text-sm text-gray-400 mt-6">
        还没有账号？<a class="text-[#4A90D9] cursor-pointer hover:underline" @click.prevent="switchView('register')">立即注册</a>
      </p>
    </div>

    <!-- ===== 注册视图 ===== -->
    <div v-show="view === 'register'">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-[#4A90D9]">糖尿病预治智能助手</h1>
        <p class="text-sm text-gray-400 mt-2">创建您的账号</p>
      </div>

      <form class="space-y-4" @submit.prevent="handleRegister">
        <!-- 注册表单字段，见下方详述 -->
      </form>

      <p class="text-center text-sm text-gray-400 mt-6">
        已有账号？<a class="text-[#4A90D9] cursor-pointer hover:underline" @click.prevent="switchView('login')">立即登录</a>
      </p>
    </div>

  </div>
</div>
```

#### 注册表单模板详述

每个输入框使用与登录表单一致的 Tailwind class 样式：

| 元素 | DOM 结构 | 绑定/属性 |
|------|----------|-----------|
| 用户名输入框 | `<input type="text" placeholder="用户名（3-50个字符）" autocomplete="username" class="w-full bg-gray-100 rounded-full px-4 py-3 outline-none text-sm focus:ring-2 focus:ring-[#4A90D9]">` | `v-model="regUsername"` |
| 密码输入框 | `<input type="password" placeholder="密码（不少于8位，含字母和数字）" autocomplete="new-password" class="...">` | `v-model="regPassword"` |
| 确认密码输入框 | `<input type="password" placeholder="确认密码" autocomplete="new-password" class="...">` | `v-model="regPasswordConfirm"` |
| 错误提示 | `<div v-if="regErrorMsg" class="text-[#FF4D4F] text-xs text-center">{{ regErrorMsg }}</div>` | — |
| 提交按钮 | `<button type="submit" :disabled="regLoading" class="w-full bg-[#4A90D9] text-white py-3 rounded-xl font-medium hover:bg-[#3A7BC8] transition disabled:opacity-50">{{ regLoading ? '注册中...' : '注册' }}</button>` | — |

**关键样式一致性**：
- 按钮主色：`bg-[#4A90D9]` / hover `bg-[#3A7BC8]`
- 错误颜色：`text-[#FF4D4F]`
- 输入框：`bg-gray-100 rounded-full px-4 py-3`
- 聚焦环：`focus:ring-2 focus:ring-[#4A90D9]`
- 按钮 padding：`py-3`（不含 `px-`，使用 `w-full` 撑满）

#### 切换链接变更

| 位置 | 原代码 | 新代码 |
|------|--------|--------|
| 登录视图底部 | `<router-link to="/login" class="text-[#4A90D9]">立即注册</router-link>` | `<a class="text-[#4A90D9] cursor-pointer hover:underline" @click.prevent="switchView('register')">立即注册</a>` |
| 注册视图底部 | （不存在） | `<a class="text-[#4A90D9] cursor-pointer hover:underline" @click.prevent="switchView('login')">立即登录</a>` |

**注意**：从 `<router-link>` 改为 `<a>` 是因为切换不再走路由。添加 `cursor-pointer hover:underline` 提升可点击可感知性（现有 `<router-link>` 默认带 cursor:pointer 和下划线样式，`<a>` 元素需显式添加）。

### `<style>` 样式块

不需要新增 `<style scoped>` 块。所有样式通过 Tailwind utility classes 覆盖，Login.vue 当前无 `<style>` 块，继续保持无 `<style>` 块。

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 前端校验失败（字段为空/格式不符） | `validateRegister()` 返回错误字符串 → `handleRegister` 设置 `regErrorMsg` 并 return，不发请求 |
| 后端返回 409（用户名已存在） | axios 响应拦截器将 `success: false` 转为 rejection → `handleRegister` catch 中取 `err.response.data.error.message` 显示 |
| 后端返回 422（校验错误） | 同上 |
| 网络错误/超时（axios timeout 15s） | catch 中 `err?.response?.data?.error?.message` 为 undefined → 显示 fallback `'注册失败'` |
| API 实例 401 拦截 | useApi 响应拦截器在 401 时自动 `clearAuth()` + 跳转 `/login` —— 注册时理论上不会 401，但拦截器保护存在 |

**错误状态重置**：
- `switchView('register')` → 清空 `regErrorMsg`（确保用户切回注册视图时看不到旧错误）
- `switchView('login')` → 清空 `errorMsg`（确保用户切回登录视图时看不到旧错误）
- `handleRegister` 每次提交时先 `regErrorMsg = ''`

## 行为契约

### 前置条件
- 用户已进入 `/login` 路由，页面渲染 `Login.vue`
- 初始 `view = 'login'`，显示登录表单

### 后置条件
- 注册成功：`authStore.token/role/user` 已设置，sessionStorage 已更新，页面跳转至 `safeRedirect(route.query.redirect)` 结果（默认 `/home`）
- 注册失败：停留在注册视图，`regErrorMsg` 显示错误信息，用户可修改后重试

### 状态变化规则

1. **`view` 状态机**：`'login'` <--> `'register'`，通过 `switchView()` 触发，每次切换清空目标视图的错误信息
2. **注册提交流程**：
   ```
   IDLE → (submit) → VALIDATING → (校验通过) → LOADING → (201) → SUCCESS → (setAuth + redirect)
                                    ↘ (校验失败) → ERROR (regErrorMsg 显示)
                    LOADING → (409/422/network) → ERROR (regErrorMsg 显示)
   ```
3. **登录与注册互不干扰**：`view` 切换时两个表单的数据（ref）和错误（errorMsg/regErrorMsg）完全独立，登录提交不影响注册表单状态，注册提交不影响登录表单状态

### 方法调用顺序

```
用户点击"立即注册" 
  → switchView('register')          // 切换视图，清空 regErrorMsg
  → 填写表单 
  → 点击"注册" 
  → handleRegister() 
    → validateRegister()            // 前端校验
    → api.post(...)                 // 后端调用
    → authStore.setAuth(...)         // 登录状态写入
    → router.replace(...)           // 跳转
```

## 依赖关系

### 依赖的已有模块

| 模块 | 导入方式 | 用途 |
|------|----------|------|
| `vue` | `import { ref } from 'vue'` | 响应式状态定义 |
| `vue-router` | `import { useRouter, useRoute } from 'vue-router'` | 路由实例、当前路由信息、跳转 |
| `@/stores/authStore` | `import { useAuthStore } from '@/stores/authStore'` | `authStore.setAuth(token, role, user)` 完成登录态写入 |
| `@/composables/useApi` | `import { api } from '@/composables/useApi'` | axios 实例，调用 `api.post('/auth/register', body)` |

### 依赖的后端接口

| 方法 | 路径 | 请求体 | 成功响应 (201) | 错误响应 |
|------|------|--------|---------------|----------|
| POST | `/api/auth/register` | `{ username: string, password: string }` | `{ success: true, data: { token, role: 'user', user: { id, username, avatar } }, message }` | 409: `{ success: false, error: { message: "用户名已存在" } }` / 422: `{ success: false, error: { message: "..." } }` |

### 暴露给后续任务的接口

本任务不暴露新的公开接口。修改后的 `Login.vue` 对外行为与修改前完全等价：
- `/login` 路由仍渲染登录/注册页面
- 登录功能不受影响
- `safeRedirect` 函数保持不变（内部函数，未导出）

## 构建验证

命令：`npm run build:client`（执行 `vue-tsc -b && vite build`）

验证要点：
- `vue-tsc` 类型检查：确保 `api.post` 类型推断正确、`authStore.setAuth()` 参数类型匹配、模板中 ref 绑定类型正确
- `vite build`：确保模板语法正确、import 路径可解析、无编译错误

由于本任务仅修改 `Login.vue` 一个 SFC 文件，不新增类型文件或 store，类型检查复杂度低，通过概率高。
