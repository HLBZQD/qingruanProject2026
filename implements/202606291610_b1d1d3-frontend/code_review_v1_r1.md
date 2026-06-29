# 代码审查报告（v1 r1）

## 审查结果
APPROVED

## 发现

无严重、无一般问题。

审查逐项核对如下（依据 `detail_v1.md` 权威设计，对照 `src/views/Login.vue` 实际源码）：

### 导入声明 (lines 2-5)
- `ref`, `useRouter/useRoute`, `useAuthStore` — 保留完全不变
- `import { api } from '@/composables/useApi'` — 新增，路径与设计一致
- 无多余或遗漏的 import

### 保留状态 (lines 7-14)
- `router`, `route`, `authStore`, `username`, `password`, `errorMsg`, `loading` — 声明、类型、初始值均未变更

### 新增 ref (lines 16-21)
- `view`: `Ref<'login' | 'register'>` 初始 `'login'` — 符合设计
- `regUsername`, `regPassword`, `regPasswordConfirm`: `Ref<string>` 初始 `''` — 符合设计
- `regErrorMsg`: `Ref<string>` 初始 `''` — 符合设计
- `regLoading`: `Ref<boolean>` 初始 `false` — 符合设计

### safeRedirect (lines 23-30)
- 逻辑未变：仅允许相对路径，拒绝 `//` 和 `://`，默认 `/home`

### handleLogin (lines 32-47)
- 源码一字未改，与设计"保留现有登录表单功能完全不变"一致

### switchView (lines 49-56)
- 签名 `(mode: 'login' | 'register'): void` — 符合设计
- 切换 `view.value`，并清空目标视图的错误信息（`login` → 清 `errorMsg`，`register` → 清 `regErrorMsg`） — 符合设计

### validateRegister (lines 58-68)
- 返回类型 `string | null` — 符合设计
- 8 条校验规则依次为：用户名必填 → 3-50 字符 → 密码必填 → ≥8 位 → 含字母 → 含数字 → 确认密码必填 → 一致性 — 完全符合设计

### handleRegister (lines 70-88)
- 签名 `async function handleRegister(): Promise<void>` — 符合设计
- 流程：前端校验 → 失败设 regErrorMsg 并 return → 成功则 `regLoading=true` / `regErrorMsg=''` → `api.post('/auth/register', body)` → 解构 `{token, role, user}` → `authStore.setAuth(token, role, user)` → `router.replace(safeRedirect(...))` → catch 取 `err?.response?.data?.error?.message || '注册失败'` → finally `regLoading=false` — 完全符合设计

### 模板 — 登录视图 (lines 95-129)
- `v-show="view === 'login'"` 包裹 — 符合设计
- 标题、表单、输入框、按钮样式与前一致，未改动
- 底部链接从 `<router-link>` 改为 `<a>` 走 `switchView('register')` — 符合设计

### 模板 — 注册视图 (lines 132-174)
- `v-show="view === 'register'"` 包裹 — 符合设计
- 标题"创建您的账号"、3 个输入框（placeholder/autocomplete）、错误提示 `v-if="regErrorMsg"`、按钮 disabled/文案 — 均与设计 DOM 详述一致
- 底部链接 `<a>` 走 `switchView('login')` — 符合设计

### 样式
- 无 `<style>` 块 — 与设计一致
- 所有 Tailwind utility class（`bg-[#4A90D9]` / `text-[#FF4D4F]` / `rounded-full` / `focus:ring-2` 等）与设计完全一致

### 类型安全
- `vue-tsc -b` 类型检查通过，无类型错误
- `authStore.setAuth(token, role, user)` 参数类型匹配（`string, 'user'|'admin', LoginUser`）

### 构建验证
- `npm run build:client` 通过，无编译错误
- `Login-DCvimgOc.js` 4.55 kB 正常产出
