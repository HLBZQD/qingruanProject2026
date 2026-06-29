# 测试审查报告（v1 r1）

## 审查结果
APPROVED

## 发现

### 交叉验证方法

审查过程中已将 test_v1.md 中所有行号引用与 `src/views/Login.vue`（实际源文件，178行）、`src/types/api.ts`、`src/stores/authStore.ts`、`src/composables/useApi.ts` 逐一核对。所有 79 项行为契约映射的行号准确无误，引用的代码片段与实际源码一致。

### [轻微] test_v1.md 第 2.1 节 — 遗漏 input type 属性验证

detail_v1.md 的注册表单模板详述明确指定了三个 input 的 type 属性：

| 元素 | 指定 type |
|------|-----------|
| 用户名输入框 | `type="text"` |
| 密码输入框 | `type="password"` |
| 确认密码输入框 | `type="password"` |

test_v1.md 第 2.1 节 T3-T6 仅验证了 input 元素存在性（T3）和 placeholder 文本（T4-T6），未显式验证 type 属性。密码输入框的 `type="password"` 直接影响浏览器密码掩码行为，属于设计明确规定的行为属性。实际代码（Login.vue:142/149/156）正确使用了这些 type，但测试清单未覆盖此项。建议在 T3 中拆分或新增一条验证项覆盖 type 属性。

### [轻微] test_v1.md 第 2.1 节 — 遗漏 autocomplete 属性验证

detail_v1.md 的注册表单模板详述明确指定：

| 元素 | 指定 autocomplete |
|------|-------------------|
| 用户名输入框 | `autocomplete="username"` |
| 密码输入框 | `autocomplete="new-password"` |
| 确认密码输入框 | `autocomplete="new-password"` |

test_v1.md 未在任何验证项中检查 autocomplete 属性。`autocomplete="new-password"` 影响浏览器密码管理器行为（是否提示保存密码、是否自动填充），属于设计明确规定的行为属性。实际代码（Login.vue:144/151/158）正确使用了这些 autocomplete 值，但测试清单未覆盖。建议新增一条验证项或扩展现有模板验证覆盖此属性。

### [轻微] test_v1.md 第 6 节 — D1 和 D3 端到端冒烟场景缺失

requirement.md 明确本批次范围覆盖 B1 + D1 + D3 三个任务，但 test_v1.md 仅包含 B1 的 6 个 E2E 冒烟场景。D1（会话历史加载，涉及 `useChatApi.ts`/`chatStore.ts`/`DoctorChatView.vue` 三个文件修改）和 D3（Admin SSE 统一 + 多模式隔离 + 行为等价性，涉及 `chatStore.ts`/`Admin.vue`/`useAdminApi.ts`/`sse.ts` 四个文件修改）均无对应冒烟场景定义。

plan.md 明确 B1 作为 R1 先行（独立任务、无文件冲突），D1/D3 后续轮次实现——这是合理的分阶段策略。但 test_v1.md 作为本轮交付物，至少应在文档中注明 D1 和 D3 的测试覆盖状态（"待后续轮次实现后补充"），并在 E2E 场景章节预留 D1/D3 场景骨架（参考 requirement.md 第 61-89 行的详细验收标准）。当前文档对此完全沉默，可能造成"批次已完成"的误判。

具体而言，requirement.md 已定义以下应覆盖但未在 test_v1.md 出现的 E2E 关键路径：

- **D1**：DoctorChatView 点击"历史会话"按钮 → 加载会话列表（含 loading/empty/error 状态）→ 选择某会话恢复 conversation_id → 续接 Dify 上下文
- **D3**：Admin.vue 切换到 chatStore.sendAdminMessage → 正常对话（user + assistant 流式 + message_end）→ 流内 error 事件 → doctor/assistant 消息不混入 admin 列表（多模式隔离验证）

### 正向确认

以下方面经交叉验证确认无误：

- **行号准确性**：test_v1.md 引用的 79 项契约映射中，所有 Login.vue 行号引用与源文件实际行号完全一致，无一行错位。
- **类型定义引用**：`LoginUser`（api.ts:40-45）、`RegisterRequest`（api.ts:35-38）、`LoginResponse`（api.ts:47-52）的行号和字段描述均正确。
- **authStore 接口**：`setAuth(token, role, user)` 签名（authStore.ts:69）、sessionStorage 写入逻辑（authStore.ts:69-83）的引用准确。
- **useApi 拦截器**：401 拦截逻辑（useApi.ts:40-55）的引用准确。
- **validateRegister 8 条规则**：顺序、文案、短路行为与源码行 58-68 完全一致。
- **handleRegister 流程 8 步**：与源码行 70-88 完全一致，含 `res.data.data` 解构、setAuth 调用顺序、router.replace、错误 fallback、finally 清理。
- **保留功能**：`safeRedirect`（行 23-30）、`handleLogin`（行 32-47）源代码一字未改，确认无误。
- **模板结构**：v-show 位置、DOM 嵌套层次、class 字符串与源码完全吻合。
- **样式一致性**：6 项 Tailwind class 验证与源码匹配。
- **E2E 场景 B1-S1 至 B1-S6**：覆盖注册成功、全部 8 条校验规则（逐条）、409 冲突、网络断开、视图切换数据保留、登录回归——B1 范围内无遗漏。
