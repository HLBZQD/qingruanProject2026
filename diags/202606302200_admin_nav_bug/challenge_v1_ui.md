# 诊断质询报告（v1）

## 质询结果

**CHALLENGED**

## 逐维度审查

### 1. 证据充分性

**[通过]** 按钮渲染条件分析正确。`menuItems` computed 依赖 `authStore.isAdmin`（`role.value === 'admin'`），代码行号引用准确（Profile.vue:225-266, authStore.ts:73, authStore.ts:58）。

**[通过]** 点击事件绑定与处理函数分析正确。`@click="onMenuClick(item)"` 绑定无误（Profile.vue:390），`onMenuClick` 中 `router.push(item.to)` 调用路径正确（Profile.vue:268-276）。

**[通过]** CSS 分析中 pointer-events、overflow 的检查与源代码一致。`.hero-bg`（Profile.vue:462-466）和 `.skeleton-hero`（Profile.vue:823-828）的 `pointer-events: none` 均不覆盖菜单按钮区域；三处 `overflow: hidden`（`.profile-hero`、`.hero-bg`、`.hidden-input`）均不裁剪菜单按钮。

**[问题-严重]** 报告在 Section 7.2 将根因指向导航守卫层，并列出了三个"最可能的拦截场景"并按概率排序（Token 过期 > role 覆写 > mustChangePassword），但**未对导航守卫代码进行实质性调查**。报告仅引用了 `router/index.ts` 的行号（101、108、114、118）并概括了守卫逻辑，但未做如下必要验证：

- 未检查 `isTokenExpired()` 的具体实现（位于 `src/composables/useAuth.ts`），无法判断 Token 过期判定的精度和边界条件（如无 `exp` 声明的 Token 直接视为过期）。
- 未对比 `loadProfile()` 成功时使用的 Token 与导航守卫检查的 Token 是否始终一致——`loadProfile()` 使用函数入口处捕获的 `storedToken`（Profile.vue:51），而守卫使用实时 `authStore.token`，二者在 BroadcastChannel 同步等异步场景下可能产生差异。
- 未通过任何运行时证据（console 日志、Network 面板截图、用户实际看到的跳转结果页面）区分三种场景。三种场景均为推测，无一经确认。

**诊断报告的核心任务要求"定位根因所在的具体代码位置和触发条件"，而当前报告仅排除了 UI 层，未正面定位根因。** 列出三个候选不等于定位根因。

**[问题-一般]** Section 4.2 垂直空间分析使用估算高度（"~200px"、"~100px"、"~88px"、"~76px"），未经浏览器 DevTools 实测验证。虽然该分析最终结论（非根因）不影响主诊断方向，但以估算值作为排除依据降低了证据质量。

**[问题-轻微]** Section 6 指出 Admin.vue "缺少页面内角色二次校验是一个安全缺口（非本次诊断范围）"。既然明确标注"非本次诊断范围"，此句属于诊断噪音，应移除或在独立安全审查中提出。

### 2. 逻辑完整性

**[通过]** 从用户点击到 `router.push('/admin')` 的 UI 事件链完整且逻辑自洽：`@click` → `onMenuClick(item)` → `router.push('/admin')`，代码路径可完整追踪。

**[通过]** CSS/DOM 层级排除分析系统性强，覆盖了 z-index、pointer-events、overflow、动画四个维度，排除了常见的 UI 阻塞场景。

**[问题-严重]** Section 2.1 的"潜在问题"段落描述了一个**不可能发生**的场景：

> "如果 sessionStorage 初始 role='admin'，按钮渲染。若后续 loadProfile() 的 API 返回 role='user'，setAuth 会覆写 role.ref，触发 isAdmin 变为 false，按钮从 DOM 中移除。"

实际代码执行时序为：

1. `profileLoading` 初始值为 `true`（Profile.vue:17）
2. `onMounted` 调用 `loadProfile()`（Profile.vue:278）
3. `loadProfile()` 内异步 API 调用期间，`profileLoading` 始终为 `true`（骨架屏显示，按钮不渲染）
4. API 返回后，`authStore.setAuth()` 被调用（Profile.vue:64-73），role 已更新为 API 返回值
5. `finally` 块中 `profileLoading` 变为 `false`（Profile.vue:87），此时按钮才首次渲染——使用的是 API 返回的 role，而非 sessionStorage 的初始 role

**按钮渲染发生在 API 返回且 role 已更新之后，不可能出现"先用 sessionStorage 的 admin 渲染按钮，后被 API 的 user 覆盖导致按钮消失"的时序。** 该段落基于错误的渲染生命周期理解，虽最终结论（"此场景下 role 在点击时刻仍为 'admin'"）方向正确，但推理过程存在事实错误。

**[问题-一般]** 报告未能追踪按钮渲染后到用户点击之间 authStore 状态的完整生命周期。具体缺失：

- `loadProfile()` 调用 `authStore.setAuth(storedToken, res.data.data.role, ...)`——使用的是函数入口捕获的 `storedToken` 而非 `authStore.token` 的实时值。若在 API 调用期间 BroadcastChannel 收到其他标签页的 `AUTH_CHANGED` 消息修改了 `authStore.token`，`setAuth` 会用旧 Token 覆盖新值。此竞态条件未被考虑。
- 导航守卫检查 `authStore.role`（router/index.ts:114）时，该值可能已被 BroadcastChannel 消息异步修改。从 `loadProfile()` 完成到用户点击之间的时间窗口内，角色状态并非不可变。

**[问题-一般]** Section 7.2 从"UI 层无缺陷"跳跃到"问题在导航守卫层"的逻辑桥梁不够稳固。报告中未经证实的前提是"导航守卫是 push 之后唯一能阻止导航到达 /admin 的机制"。但存在其他可能：Vue Router 的 `router.push` 返回的 Promise 可能因路由配置问题（如 `/admin` 路由未正确注册、懒加载组件加载失败）而 reject，虽然概率低但未被考虑或排除。

### 3. 覆盖完备性

**[通过]** 问题现象"管理员可以看到'智能管理'入口"已完整解释：当 `authStore.isAdmin` 为 true（即 `role === 'admin'`）时按钮渲染于 `menuItems` 中。

**[通过]** TabBar 显隐对导航的影响已分析：`showTabBar` computed 包含 `/admin` 在 `noTabRoutes` 中，导航成功后 TabBar 正确隐藏（App.vue:23-26），TabBar 不拦截 Profile 内按钮的 click 事件。

**[问题-一般]** 需求文档列出的关键文件 `src/composables/useAuth.ts` 在诊断报告中**完全未被检查**。该文件包含：

- `isTokenExpired()` 函数（即导航守卫判断 Token 过期的核心逻辑）：无 `exp` 声明的 Token 被视为过期（useAuth.ts:73-74），这一设计细节直接影响"Token 过期"场景的发生概率。
- `parseToken()` 函数：若 Token 格式异常导致解析失败，`isTokenExpired` 返回 true，守卫会误判为过期。

跳过此文件导致对 Scenario 1（Token 过期）的分析停留在表面，无法评估其真实可能性。

**[问题-一般]** 问题现象"点击后无法正常跳转到 /admin"中**"无法正常跳转"的具体表现未被澄清**。用户实际看到的是什么页面？是 `/login?redirect=%2Fadmin`、`/home`、`/change-password`，还是停留在 `/profile` 无任何反应？报告 Section 7.3 列举了四种可能结果，但需求描述本身未提供这一关键信息。诊断报告应明确指出此信息缺失阻碍了根因定位，而非仅列出可能性后即结束。

**[问题-轻微]** BroadcastChannel 跨标签页同步机制（authStore.ts:19-55）未被提及。该机制可在任意时刻异步修改 authStore 的 token/role/user 状态，是按钮渲染后到点击前状态可能发生变化的通道之一。虽非高概率根因，但应在分析中简要说明已考虑并排除。

## 质询要点

### 质询 1：根因未正面定位，仅做排除法

- **问题**：报告标题限定为"UI/事件层"，但 Section 7.2 跨越范围声称"根因指向导航守卫层"并列出三个推测性子场景。三个场景均未经验证，属于假设而非诊断结论。诊断任务要求"定位根因所在的具体代码位置和触发条件"，当前产出未满足此要求。
- **原因**：这使修复者无法采取行动——不知道是修复 Token 刷新逻辑、角色同步问题还是 mustChangePassword 标记清除机制。诊断停留在排除层而非定位层。
- **建议方向**：
  1. 需要获取用户点击"智能管理"后**实际看到的页面**（登录页/首页/改密页/无反应），这是区分三种场景的关键信息。
  2. 阅读 `src/composables/useAuth.ts` 中 `isTokenExpired()` 的完整实现，确定 Token 过期判定规则。
  3. 在导航守卫 `beforeEach` 中增加临时诊断日志，捕获点击时刻的 `authStore.token` 过期状态、`authStore.role` 值、`mustChangePassword` 值。
  4. 检查后端 `/user/profile` 接口对管理员账号返回的 `role` 字段值。

### 质询 2：按钮渲染生命周期分析错误

- **问题**：Section 2.1 的"潜在问题"描述了"先用 sessionStorage admin 渲染按钮，后被 API user 覆盖"的场景，但实际代码中 `profileLoading` 初始为 true，按钮在 API 返回且 `setAuth` 完成后才首次渲染。该场景不存在。
- **原因**：此错误虽未改变最终结论方向（报告中自身也认为该场景概率低），但表明诊断者对 `loadProfile()` 和模板条件渲染的交互时序理解有偏差，可能遗漏其他时序相关问题。
- **建议方向**：重新梳理 Profile.vue 的完整渲染时序：`onMounted` → `loadProfile()` 异步执行 → `profileLoading` 状态转换 → 按钮首次渲染。确认在此时间线上 `authStore.role` 的唯一来源是 API 返回值的 `res.data.data.role`。

### 质询 3：关键文件未审查

- **问题**：`src/composables/useAuth.ts`（JWT 解析与过期检测核心逻辑）完全未被检查。导航守卫的 Token 过期判断直接依赖此文件的 `isTokenExpired()` 函数，跳过它意味着对 Scenario 1 的分析缺乏代码层面的验证。
- **原因**：若 `isTokenExpired()` 存在边界行为（如时钟偏差容忍度、无 exp 声明的处理），将直接影响 Token 过期场景是否为根因的判断。
- **建议方向**：审查 `useAuth.ts` 中 `parseToken()` 和 `isTokenExpired()` 的完整实现，确认 Token 过期检测逻辑是否与后端 JWT 签发策略一致。特别注意 `Math.floor(Date.now() / 1000) >= payload.exp` 在 exp 恰好等于当前时间戳时的行为。
