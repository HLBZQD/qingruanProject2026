# 静态验证清单 / 契约验证报告（v1）

## 任务标识

- **任务编号**: B1（Login.vue 注册表单）
- **详细设计**: `detail_v1.md`
- **实现报告**: `code_v1.md`
- **验证时间**: 2026-06-29
- **验证方式**: 静态契约对照（本项目无单元测试框架，不引入新依赖，不编写运行时测试）

---

## 1. 行为契约逐条验证

以下每条契约来自 `detail_v1.md` 的行为契约章节，逐条标注实现位置与验证结论。

### 1.1 前置条件

| # | 契约 | 代码位置 | 验证结论 |
|---|------|----------|----------|
| P1 | 用户已进入 `/login` 路由，页面渲染 `Login.vue` | 路由配置 `src/router/index.ts` 中 `/login` → `Login.vue`（本任务未修改路由，保持不变） | 通过 |
| P2 | 初始 `view = 'login'`，显示登录表单 | `Login.vue:16` — `const view = ref<'login' \| 'register'>('login')`；`Login.vue:96` — `<div v-show="view === 'login'">` | 通过 |

### 1.2 后置条件

| # | 契约 | 代码位置 | 验证结论 |
|---|------|----------|----------|
| Q1 | 注册成功 → `authStore.token/role/user` 已设置 | `Login.vue:80-81` — `const { token, role, user } = res.data.data; authStore.setAuth(token, role, user)`；`authStore.ts:69-83` — `setAuth()` 写入 `token/role/user` ref 及 sessionStorage | 通过 |
| Q2 | 注册成功 → 页面跳转至 `safeRedirect(route.query.redirect)` 结果（默认 `/home`） | `Login.vue:82` — `router.replace(safeRedirect(route.query.redirect))` | 通过 |
| Q3 | 注册失败 → 停留在注册视图，`regErrorMsg` 显示错误信息 | `Login.vue:84` — catch 中 `regErrorMsg.value = err?.response?.data?.error?.message \|\| '注册失败'`；模板 `Login.vue:161` — `<div v-if="regErrorMsg">` 条件渲染 | 通过 |
| Q4 | 注册失败 → 用户可修改后重试 | 失败不跳转，`regLoading = false`（`Login.vue:86`），表单字段 v-model 绑定保持用户输入，按钮恢复可点击 | 通过 |

### 1.3 view 状态机

| # | 契约 | 代码位置 | 验证结论 |
|---|------|----------|----------|
| S1 | `view` 类型为 `'login' \| 'register'` | `Login.vue:16` — `ref<'login' \| 'register'>('login')` | 通过 |
| S2 | `switchView('register')` → 切换到注册，清空 `regErrorMsg` | `Login.vue:49-56` — `view.value = mode`，mode 为 `'register'` 时 `regErrorMsg.value = ''` | 通过 |
| S3 | `switchView('login')` → 切换到登录，清空 `errorMsg` | `Login.vue:49-56` — mode 为 `'login'` 时 `errorMsg.value = ''` | 通过 |
| S4 | 登录与注册互不干扰（ref 独立） | 登录 ref: `username/password/errorMsg/loading`（行11-14）；注册 ref: `regUsername/regPassword/regPasswordConfirm/regErrorMsg/regLoading`（行17-21）—— 两组 ref 完全独立，各自绑定到不同表单的 v-model | 通过 |

### 1.4 注册提交流程

| # | 契约 | 代码位置 | 验证结论 |
|---|------|----------|----------|
| F1 | IDLE → VALIDATING → (校验失败) → ERROR | `Login.vue:71-74` — `const errMsg = validateRegister(); if (errMsg) { regErrorMsg.value = errMsg; return }` | 通过 |
| F2 | IDLE → VALIDATING → LOADING | `Login.vue:76-77` — `regLoading.value = true; regErrorMsg.value = ''` | 通过 |
| F3 | LOADING → SUCCESS → setAuth + redirect | `Login.vue:79-82` — `api.post(...)` → `authStore.setAuth(...)` → `router.replace(...)` | 通过 |
| F4 | LOADING → ERROR (409/422/network) | `Login.vue:83-84` — catch 中设置 `regErrorMsg` | 通过 |
| F5 | finally: `regLoading = false` | `Login.vue:85-87` — `finally { regLoading.value = false }` | 通过 |

### 1.5 validateRegister 校验规则（8条，按顺序）

| # | 规则 | 代码位置 | 验证结论 |
|---|------|----------|----------|
| V1 | 用户名必填 | `Login.vue:59` — `if (!regUsername.value) return '请输入用户名'` | 通过 |
| V2 | 用户名字符数 3-50 | `Login.vue:60` — `if (regUsername.value.length < 3 \|\| regUsername.value.length > 50) return '用户名需3-50个字符'` | 通过 |
| V3 | 密码必填 | `Login.vue:61` — `if (!regPassword.value) return '请输入密码'` | 通过 |
| V4 | 密码长度 >= 8 | `Login.vue:62` — `if (regPassword.value.length < 8) return '密码不少于8位'` | 通过 |
| V5 | 密码包含字母 | `Login.vue:63` — `if (!/[a-zA-Z]/.test(regPassword.value)) return '密码需包含字母'` | 通过 |
| V6 | 密码包含数字 | `Login.vue:64` — `if (!/[0-9]/.test(regPassword.value)) return '密码需包含数字'` | 通过 |
| V7 | 确认密码必填 | `Login.vue:65` — `if (!regPasswordConfirm.value) return '请确认密码'` | 通过 |
| V8 | 确认密码与密码一致 | `Login.vue:66` — `if (regPasswordConfirm.value !== regPassword.value) return '两次密码不一致'` | 通过 |
| V9 | 全部通过返回 null | `Login.vue:67` — `return null` | 通过 |
| V10 | 遇第一个失败即返回（短路） | 8 条 `if (...) return ...` 顺序执行，无 fall-through | 通过 |

### 1.6 方法调用顺序

| # | 契约 | 代码位置 | 验证结论 |
|---|------|----------|----------|
| C1 | 用户点击"立即注册" → `switchView('register')` | `Login.vue:128` — `@click.prevent="switchView('register')"` | 通过 |
| C2 | 点击"注册"按钮 → `handleRegister()` | `Login.vue:139` — `@submit.prevent="handleRegister"` | 通过 |
| C3 | `handleRegister()` 内先调 `validateRegister()` | `Login.vue:71` — 函数体首行调用 | 通过 |
| C4 | `handleRegister()` 再 `api.post(...)` | `Login.vue:79` — 校验通过后调用 | 通过 |
| C5 | `handleRegister()` 再 `authStore.setAuth(...)` | `Login.vue:80-81` — api 成功后调用 | 通过 |
| C6 | `handleRegister()` 再 `router.replace(...)` | `Login.vue:82` — setAuth 后跳转 | 通过 |

---

## 2. 模板结构验证

### 2.1 DOM 结构对照

| # | 设计要求 | 代码位置 | 验证结论 |
|---|----------|----------|----------|
| T1 | 登录视图用 `v-show="view === 'login'"` 包裹 | `Login.vue:96` | 通过 |
| T2 | 注册视图用 `v-show="view === 'register'"` 包裹 | `Login.vue:133` | 通过 |
| T3 | 注册表单 3 个 input（用户名/密码/确认密码） | `Login.vue:140-160` — 3 个 `<input>` 元素 | 通过 |
| T4 | 用户名 input placeholder="用户名（3-50个字符）" | `Login.vue:143` | 通过 |
| T5 | 密码 input placeholder="密码（不少于8位，含字母和数字）" | `Login.vue:150` | 通过 |
| T6 | 确认密码 input placeholder="确认密码" | `Login.vue:157` | 通过 |
| T7 | 错误提示 `v-if="regErrorMsg"` 条件渲染 | `Login.vue:161` | 通过 |
| T8 | 按钮 disabled 绑定 `regLoading` | `Login.vue:164` — `:disabled="regLoading"` | 通过 |
| T9 | 按钮文案 "注册中..." / "注册" | `Login.vue:167` — `{{ regLoading ? '注册中...' : '注册' }}` | 通过 |
| T10 | 切换链接从 `<router-link>` 改为 `<a>` + `@click.prevent` | `Login.vue:128`（登录视图底部）、`Login.vue:172`（注册视图底部） | 通过 |
| T11 | 切换链接样式添加 `cursor-pointer hover:underline` | `Login.vue:128` / `Login.vue:172` | 通过 |

### 2.2 样式一致性

| # | 设计要求 | 代码位置 | 验证结论 |
|---|----------|----------|----------|
| ST1 | 按钮主色 `bg-[#4A90D9]` | `Login.vue:165` | 通过 |
| ST2 | 按钮 hover `bg-[#3A7BC8]` | `Login.vue:165` — `hover:bg-[#3A7BC8]` | 通过 |
| ST3 | 错误颜色 `text-[#FF4D4F]` | `Login.vue:161` | 通过 |
| ST4 | 输入框 `bg-gray-100 rounded-full px-4 py-3` | `Login.vue:145/152/159` | 通过 |
| ST5 | 聚焦环 `focus:ring-2 focus:ring-[#4A90D9]` | `Login.vue:145/152/159` | 通过 |
| ST6 | 按钮 padding `py-3`（不含 px-） | `Login.vue:165` — `py-3`，无 `px-`，用 `w-full` 撑满 | 通过 |

---

## 3. 依赖关系验证

| # | 依赖 | 设计要求 | 代码位置 | 验证结论 |
|---|------|----------|----------|----------|
| D1 | `ref` from `vue` | 保留 | `Login.vue:2` | 通过 |
| D2 | `useRouter, useRoute` from `vue-router` | 保留 | `Login.vue:3` | 通过 |
| D3 | `useAuthStore` from `@/stores/authStore` | 保留 | `Login.vue:4` | 通过 |
| D4 | `api` from `@/composables/useApi` | 新增 | `Login.vue:5` | 通过 |
| D5 | `api.post('/auth/register', body)` 请求体结构 `{ username, password }` | 与 `RegisterRequest` 契约一致 | `Login.vue:79` — `{ username: regUsername.value, password: regPassword.value }` | 通过 |
| D6 | `authStore.setAuth(token, role, user)` 参数类型匹配 | `LoginUser` 接口 `{ id, username, role, avatar }` | `Login.vue:81`；`authStore.ts:69` 签名 `setAuth(newToken: string, newRole: 'user' \| 'admin', newUser: LoginUser)` | 通过 |
| D7 | 无新增 `<style>` 块 | 不创建 style 块 | Login.vue 全文无 `<style>` 标签 | 通过 |
| D8 | 无新增类型文件 | 不创建新类型 | 仅修改 `Login.vue` 一个文件 | 通过 |

---

## 4. 错误处理验证

| # | 场景 | 设计要求 | 代码位置 | 验证结论 |
|---|------|----------|----------|----------|
| E1 | 前端校验失败 | `validateRegister()` 返回错误字符串 → 设置 `regErrorMsg` 并 return | `Login.vue:71-74` | 通过 |
| E2 | 后端 409（用户名已存在） | catch 中取 `err.response.data.error.message` | `Login.vue:84` — `err?.response?.data?.error?.message` | 通过 |
| E3 | 后端 422（校验错误） | 同上 | 同上 | 通过 |
| E4 | 网络错误/超时 | fallback `'注册失败'` | `Login.vue:84` — `\|\| '注册失败'` | 通过 |
| E5 | 401 拦截（理论上不触发） | useApi 响应拦截器自动 clearAuth + 跳转 `/login` | `useApi.ts:40-55` | 通过（拦截器保护存在，无需本任务修改） |
| E6 | `switchView('register')` 清空 `regErrorMsg` | 确保用户切回注册时看不到旧错误 | `Login.vue:53-54` | 通过 |
| E7 | `switchView('login')` 清空 `errorMsg` | 确保用户切回登录时看不到旧错误 | `Login.vue:51-52` | 通过 |
| E8 | `handleRegister` 提交时先清空 `regErrorMsg` | 避免旧错误残留 | `Login.vue:77` — `regErrorMsg.value = ''` | 通过 |

---

## 5. 保留功能不受影响验证

| # | 验证项 | 代码位置 | 验证结论 |
|---|--------|----------|----------|
| K1 | `safeRedirect()` 函数签名和实现未变 | `Login.vue:23-30` | 通过 |
| K2 | `handleLogin()` 函数签名和实现未变 | `Login.vue:32-47` | 通过 |
| K3 | 登录表单 ref（username/password/errorMsg/loading）未变 | `Login.vue:11-14` | 通过 |
| K4 | 登录表单 input v-model 绑定未变 | `Login.vue:103-104`（username）、`Login.vue:110-111`（password） | 通过 |
| K5 | 登录表单按钮 disabled + 文案逻辑未变 | `Login.vue:120-124` | 通过 |
| K6 | 登录表单错误提示 v-if + class 未变 | `Login.vue:117` | 通过 |
| K7 | router/route/authStore 初始化语句未变 | `Login.vue:7-9` | 通过 |

---

## 6. 端到端冒烟验证场景

以下场景需人工或冒烟测试验证，标注了验证步骤与预期结果。

### 场景 B1-S1：注册成功完整流程

**前置**：后端服务运行中，数据库无用户 `testuser_e2e`。

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 浏览器访问 `http://localhost:5173/login` | 页面显示登录表单（用户名+密码输入框+登录按钮），底部显示"还没有账号？立即注册"链接 |
| 2 | 点击"立即注册" | 视图切换到注册表单（用户名+密码+确认密码+注册按钮），底部显示"已有账号？立即登录" |
| 3 | 输入用户名 `testuser_e2e` | 输入框显示输入内容 |
| 4 | 输入密码 `Test1234` | 密码输入框显示掩码 |
| 5 | 输入确认密码 `Test1234` | 确认密码输入框显示掩码 |
| 6 | 点击"注册"按钮 | 按钮变为 disabled + "注册中..."，请求发出 |
| 7 | 等待响应 | 页面跳转至 `/home`（或 query.redirect 指定路径），导航栏显示已登录状态（用户名/头像） |
| 8 | 打开浏览器 DevTools → Application → Session Storage | `token`、`role`（值为 `user`）、`user`（JSON 含 id/username/avatar）均已写入 |

### 场景 B1-S2：注册表单前端校验

**前置**：已在注册视图。

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 所有字段留空，点击"注册" | 显示红色错误提示"请输入用户名"，按钮不进入 loading 状态 |
| 2 | 输入用户名 `ab`（2字符），点击"注册" | 显示"用户名需3-50个字符" |
| 3 | 输入用户名 `testok`，密码留空，点击"注册" | 显示"请输入密码" |
| 4 | 输入密码 `1234567`（7位纯数字），点击"注册" | 显示"密码不少于8位" |
| 5 | 输入密码 `12345678`（8位纯数字），点击"注册" | 显示"密码需包含字母" |
| 6 | 输入密码 `abcdefgh`（8位纯字母），点击"注册" | 显示"密码需包含数字" |
| 7 | 输入密码 `Test1234`，确认密码留空，点击"注册" | 显示"请确认密码" |
| 8 | 输入确认密码 `Test5678`（与密码不一致），点击"注册" | 显示"两次密码不一致" |

### 场景 B1-S3：注册失败 — 用户名已存在（409）

**前置**：数据库中已存在用户 `existing_user`。

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 注册表单输入用户名 `existing_user`，密码 `Test1234`，确认密码 `Test1234` | — |
| 2 | 点击"注册" | 按钮短暂显示"注册中..."，然后恢复"注册"，显示错误提示"用户名已存在"（来自后端 409 响应） |
| 3 | 修改用户名为 `existing_user2`，再次点击"注册" | 注册成功，跳转至 `/home` |

### 场景 B1-S4：注册失败 — 网络断开

**前置**：后端服务已停止或浏览器 DevTools Network 设为 Offline。

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 填写有效注册表单，点击"注册" | 按钮短暂显示"注册中..."，然后恢复"注册"，显示错误提示"注册失败"（fallback 文案） |

### 场景 B1-S5：登录与注册视图切换不丢数据

**前置**：已在注册视图，表单已填写一半。

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 注册表单输入用户名 `test123`、密码 `Test1234` | 表单显示输入内容 |
| 2 | 点击"立即登录"切换回登录视图 | 显示登录表单，无错误提示（errorMsg 被 switchView 清空） |
| 3 | 在登录表单输入用户名 `loginuser` | 登录表单显示 `loginuser` |
| 4 | 点击"立即注册"切回注册视图 | 注册表单用户名仍为 `test123`、密码仍为 `Test1234`（v-show 保留 DOM 状态），无错误提示（regErrorMsg 被 switchView 清空） |

### 场景 B1-S6：登录功能不受影响

**前置**：已注册用户 `testuser_e2e`。

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 访问 `/login` | 默认显示登录视图 |
| 2 | 输入 `testuser_e2e` / `Test1234`，点击"登录" | 登录成功，跳转至 `/home`，行为与修改前完全一致 |
| 3 | 退出登录，再次访问 `/login`，输入错误密码 | 显示"用户名或密码错误"（与修改前一致） |

---

## 7. 类型检查覆盖情况

### 7.1 vue-tsc 编译验证

实现报告 `code_v1.md` 记录了 `npm run build:client`（执行 `vue-tsc -b && vite build`）结果：

- **vue-tsc 类型检查**: 通过，无类型错误
- **vite build**: 通过，产物正常生成

说明以下类型在编译期已被校验：

| 校验项目 | 涉及代码 | 校验方式 |
|----------|----------|----------|
| `api.post('/auth/register', body)` 类型推断 | `Login.vue:79` | axios 实例类型推断，body 对象字面量 `{ username: string, password: string }` 符合 `RegisterRequest` 契约 |
| `authStore.setAuth(token, role, user)` 参数类型 | `Login.vue:81` | `authStore.ts:69` 签名 `(newToken: string, newRole: 'user' \| 'admin', newUser: LoginUser)`，vue-tsc 校验实参与形参类型兼容 |
| `res.data.data` 解构 `{ token, role, user }` | `Login.vue:80` | vue-tsc 校验解构变量存在性 |
| `router.replace(safeRedirect(...))` | `Login.vue:82` | `safeRedirect` 返回 `string`，`router.replace` 接受 `string`，类型匹配 |
| `view` ref 联合类型 | `Login.vue:16` | `Ref<'login' \| 'register'>`，`switchView` 参数类型匹配，模板中 `v-show` 比较类型安全 |
| 模板 ref 绑定 | `Login.vue:141/148/155` | `v-model` 双向绑定，vue-tsc 校验 ref 类型与 input 值类型兼容 |
| `err: any` catch 类型标注 | `Login.vue:83` | 与现有 `handleLogin` 风格一致（`Login.vue:42`），显式 `any` 标注，vue-tsc 不报错 |

### 7.2 涉及的接口类型（已在 vue-tsc 范围内）

| 接口 | 定义位置 | 在 Login.vue 中的使用 |
|------|----------|----------------------|
| `LoginUser` | `src/types/api.ts:40-45` | `authStore.setAuth()` 第三个参数类型 |
| `RegisterRequest` | `src/types/api.ts:35-38` | `api.post` body 对象字面量隐式符合 |
| `LoginResponse` | `src/types/api.ts:47-52` | `res.data.data` 解构隐式符合 |

---

## 8. 设计偏差检查

实现报告 `code_v1.md` 声明"无偏差"。逐项对照 `detail_v1.md`：

| 检查维度 | 结论 |
|----------|------|
| 所有 ref 名称、类型、初始值 | 与设计完全一致 |
| 所有函数签名（switchView / validateRegister / handleRegister） | 与设计完全一致 |
| validateRegister 8 条规则及顺序 | 与设计完全一致 |
| handleRegister 执行流程 8 步 | 与设计完全一致 |
| switchView 清空错误逻辑 | 与设计完全一致 |
| 模板 DOM 结构、v-show、class | 与设计完全一致 |
| import 语句 | 与设计完全一致 |
| 样式 Tailwind class | 与设计完全一致 |
| 无新增类型文件 | 与设计完全一致 |
| 无新增 style 块 | 与设计完全一致 |
| 保留的 handleLogin / safeRedirect | 源代码一字未改 |

**结论：零偏差。**

---

## 9. 遗留风险与注意事项

1. **密码前端校验强度**：`/[a-zA-Z]/` 和 `/[0-9]/` 仅要求密码"包含"字母和数字，未限制特殊字符或禁止常见弱密码。这是设计文档的既定范围，后端 bcryptjs 哈希存储提供额外安全层。
2. **注册用户名唯一性**：仅依赖后端 409 响应，前端不做唯一性异步校验。符合设计文档的简单策略。
3. **并发注册同一用户名**：理论上两个标签页同时注册同一用户名可能都通过前端校验，后端数据库 UNIQUE 约束确保只有一个成功，另一个收到 409。前端错误处理已覆盖此场景。
4. **XSS 防护**：错误信息 `regErrorMsg` 通过 `{{ }}` 文本插值渲染，Vue 自动转义 HTML。`v-model` 绑定不涉及 v-html。安全。
5. **本项目无单元测试框架**（package.json 无 vitest/jest），本报告不包含运行时测试代码。冒烟验证需人工按第 6 节场景执行。
6. **代码报告中的编译警告**：`INEFFECTIVE_DYNAMIC_IMPORT on authStore.ts` 为预存问题，与本任务无关。

---

## 10. 验证总结

| 维度 | 通过/总计 | 状态 |
|------|-----------|------|
| 行为契约验证 | 39/39 | 全部通过 |
| 模板结构验证 | 11/11 | 全部通过 |
| 样式一致性验证 | 6/6 | 全部通过 |
| 依赖关系验证 | 8/8 | 全部通过 |
| 错误处理验证 | 8/8 | 全部通过 |
| 保留功能验证 | 7/7 | 全部通过 |
| 设计偏差 | 0 | 零偏差 |
| vue-tsc 类型检查 | 通过 | 无类型错误 |
| vite build | 通过 | 产物正常 |
| E2E 冒烟场景 | 6 个场景已定义 | 待人工/冒烟执行 |

**总体结论：实现与详细设计完全一致，所有行为契约得到满足，类型检查通过，零偏差。可进入下一阶段。**
