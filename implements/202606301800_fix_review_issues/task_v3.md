# 任务指令（v3）

## 动作
NEW

## 任务描述
修复2个P1后端安全缺陷：

1. **S5 — admin.js Text2SQL 功能 SQL 注入漏洞**（`server/routes/admin.js`）：修复 `dispatchParameterizedQuery` 函数在三个工具操作（`query_table` 第241行、`update_record` 第301行、`delete_record` 第320行）中将用户提供的 `params.where` 直接拼接到 SQL 字符串的问题。需将 WHERE 条件改为参数化占位符重建，或对 WHERE 子句进行严格语法校验（仅允许 `column = value AND ...` 模式）。

2. **S6 — encryption.js 硬编码默认加密密钥**（`server/utils/encryption.js`）：修复 `deriveKey()` 第22行中 `process.env.JWT_SECRET` 未设置时静默回退到硬编码字符串 `'default_secret_change_me'` 的问题。需改为：若 JWT_SECRET 未设置，在服务启动时抛出明确错误，阻止使用可预测派生密钥运行。

同步更新 `reviews/202606291800_full_review/todo.md` 将 S5/S6 标记为已完成（格式参照 v1/v2 先例）。

## 选择理由
P1（本迭代）最高剩余优先级。两个问题均为后端安全缺陷，共享 `server/` 上下文，独立于前端修改。S5（SQL注入）为功能性安全漏洞——攻击者可用 admin 凭证执行任意 WHERE 条件导致数据破坏；S6（硬编码密钥）使 AES-256-GCM 加密静默失效——若部署时忘记设置 JWT_SECRET，聊天 token 加密失去保护意义。两问题修复不依赖彼此，可在同一任务中安全处理。

## 任务上下文

### S5 — SQL 注入漏洞

- **位置**: `server/routes/admin.js:241, 301, 320`
- **来源**: Round 2 #S11
- **描述**: `dispatchParameterizedQuery` 函数在 `query_table`、`update_record`、`delete_record` 三个工具操作中将 `params.where`（来自用户请求体）直接拼接到 SQL 字符串，未使用参数化占位符。`params.table` 通过了白名单校验，但 `params.where` 是原始用户输入，可注入任意 WHERE 条件。攻击者需要 admin 凭证，但一旦认证通过即可用于大规模数据破坏。
- **建议修复**: 将 `params.where` 解析为结构化条件后用参数化占位符重建，或对 WHERE 子句进行严格的语法校验（仅允许 `column = value AND ...` 模式）。

### S6 — 硬编码加密密钥

- **位置**: `server/utils/encryption.js:22`
- **来源**: Round 2 #S6
- **描述**: `deriveKey()` 中，若 `process.env.JWT_SECRET` 未设置，回退到硬编码字符串 `'default_secret_change_me'`。代码不会报错或警告，静默使用可预测的密钥。聊天 token 的 AES-256-GCM 加密将使用可预测的派生密钥。
- **建议修复**: 若 JWT_SECRET 未设置，抛出启动错误：`throw new Error('[encryption] JWT_SECRET 未设置，无法派生加密密钥。')`

### 审查报告原文

来源：`reviews/202606291800_full_review/todo.md` 第50-62行（S5）、第57-62行（S6），Round 2 代码质量审查。

## 已有代码上下文

### 已完成批次
- **v1 (R1)**: P0 功能性断裂修复（S7/S8/S9）—— ArticleDetailView 加载、DoctorChatView 导入、authStore 清理链。3/3 通过。
- **v2 (R2)**: P1 前端设计合规修复（S1/S2）—— App.vue 死代码清理、AiChatDialog 4项综合修复。13/13 测试通过，4文件修改验证通过。

### S5 相关代码结构
- `server/routes/admin.js`：管理后台路由，包含 Text2SQL 功能的 `dispatchParameterizedQuery` 辅助函数和 6 个工具操作（get_table_schema、list_tables、query_table、count_records、update_record、delete_record）。
- 项目使用 better-sqlite3，支持参数化查询（`stmt.bind()` 或 `db.prepare().run(params)` 语法）。
- `params.table` 已有白名单校验，`params.where` 为问题所在。

### S6 相关代码结构
- `server/utils/encryption.js`：AES-256-GCM 加密工具模块，导出 `encrypt()`、`decrypt()`、`deriveKey()`。
- `deriveKey()` 从 `process.env.JWT_SECRET` 派生加密密钥，使用 PBKDF2（scrypt 或 crypto.pbkdf2Sync）。
- 调用方：`server/routes/auth.js`（登录 token 加密）、`server/routes/chat.js`（对话 token 加密）等。
- 若 JWT_SECRET 未设置，应在 `deriveKey()` 第一时间抛出错误，阻止服务启动。
