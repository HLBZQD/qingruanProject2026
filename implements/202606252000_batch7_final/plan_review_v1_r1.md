# 批次 7 — 计划评审报告 v1 r1

## 评审结论：**APPROVED** (附建议)

---

## 1. 完整性审查

### 1.1 需求覆盖矩阵

| 需求条目 | plan.md 覆盖 | task_v1.md 对应 | 评估 |
|----------|-------------|-----------------|------|
| AI 文章生成 POST /api/articles/generate | Step 3 | Task 3 | 覆盖完整（两阶段 + Mock + 落库 + 隔离） |
| 头像上传 POST /api/upload/avatar | Step 4 | Task 4 | 覆盖完整（multer + 文件类型/大小校验 + 错误码） |
| 管理日志 GET /api/admin/logs | Step 5 | Task 5 | 覆盖完整（JOIN users + 分页 + 权限） |
| SQL 执行 POST /api/admin/execute | Step 6 | Task 6 | 覆盖完整（SELECT only + 禁词列表 + 日志记录） |
| DIFY_API_BASE 变量名修正 | Step 1 | Task 1 | 覆盖完整（2 文件 + grep 验证） |
| 统一错误处理 | 已有不重复 | Task 8.3 | 已验证 errorHandler 格式 + 新增路由使用统一格式 |
| 统一分页 | 已有不重复 | — | pagination.js 已满足要求 |
| 最终验收 19 端点 | Step 8 | Task 8 | 覆盖完整 |

**结论**：需求 100% 覆盖，无遗漏。

### 1.2 设计文档对齐审查

| 设计节 | 设计要点 | plan.md 对齐 | 偏差说明 |
|--------|---------|-------------|---------|
| 3.2.21 POST /api/articles/generate | 两阶段、category 推荐逻辑、响应含 tags/summary/is_collected | Step 3 对齐 | Mock 策略设计文档依赖 difyService Mock（返回 PLAN 数据），articles.js 层额外提供硬编码 Mock 兜底，更健壮 |
| 3.2.29 POST /api/admin/execute | 双认证、tool_name、行级权限 | Step 6 **缩减** | 批次 7 仅实现基础版（SELECT only + 禁词），Text2SQL 工具链/行级权限按批次文档建议延期。此为**合理裁剪**，设计文档也注明"完整版本放入后续" |
| 3.2.30 GET /api/admin/logs | operator_username JOIN、分页 | Step 5 对齐 | 完全对齐 |
| 3.2.31 POST /api/upload/avatar | multipart/form-data、JPEG/PNG/WebP、≤2MB、/static/uploads/avatars/ | Step 4 对齐 | 完全对齐 |
| 批次 7 文档 | 建议仅实现 SELECT 基础版 | 对齐 | 与设计文档建议一致 |

**结论**：设计文档对齐度 95%。`admin/execute` 缩减为基础 SELECT 版是批次文档第 7.3.4 节和第 10 节明确建议的"两天内只做安全基础版"，属于设计层面的合理裁剪。

### 1.3 现有代码兼容性审查

| 变更文件 | 操作 | 对现有功能影响 |
|---------|------|---------------|
| `difyService.js:85` | 修改变量名 | **正向影响**：修正后 Dify 真正可用。不影响任何现有调用者 |
| `sseProxy.js:10` | 修改变量名 | **正向影响**：修正后 SSE 代理真正可用 |
| `validators.js` | 新增函数 | 无影响（追加导出） |
| `articles.js` | 新增 POST /generate | 需注意路由顺序：`POST /generate` 必须在 `GET /:id` 之前声明，task_v1 已明确此点。现有 GET/POST/DELETE 路由不受影响 |
| `upload.js` | 新建 | 无影响 |
| `admin.js` | 新建 | 无影响 |
| `index.js` | 新增 2 行挂载 | 无影响（纯增量） |

**风险点**：articles.js 的路由顺序（`POST /generate` vs `GET /:id`）是潜在坑点。task_v1 Task 3.4 已标注必须在 `GET /:id` 之前声明。

---

## 2. 正确性审查

### 2.1 安全审查

| 风险项 | plan.md 对策 | 评估 |
|--------|-------------|------|
| SQL 注入（admin/execute） | 仅允许 SELECT + 禁词黑名单 | **可通过**。`db.prepare(sql).all()` 使用 better-sqlite3 的参数化查询，但此处是直接传原始 SQL。SELECT-only + 禁词黑名单是批次文档建议的安全策略。建议在 task 中补充：若 SQL 执行抛出异常，不要泄露原始错误信息到客户端（task 已含 500 兜底） |
| 文件上传安全 | multer fileFilter (MIME) + 2MB 限制 | **可通过**。建议补充：检查文件魔数而不仅依赖 MIME（低优先级，批次文档未要求） |
| 权限校验 | `authMiddleware` + `adminMiddleware` 链式调用 | **通过** |
| 幂等性 | 内存 Map 30s 去重 | **可通过**。建议补充：进程重启后 Map 丢失可接受（30s 窗口短，重启本身已阻断重复请求） |

### 2.2 数据一致性审查

| 操作 | 事务 | 评估 |
|------|------|------|
| articles/generate INSERT | 单条 INSERT，无需事务 | 通过 |
| admin/execute + admin_logs INSERT | 日志写入失败不阻塞响应 | **审慎通过**。任务已说明日志 `try/catch` 包裹，响应先返回再 `console.error`。语义正确：日志审计不应阻塞业务 |
| upload/avatar | 纯文件 I/O，不涉及 DB | 通过 |

### 2.3 设计文档中有明确伪代码的端点对齐

设计文档 7.3.3 节 admin/execute 完整版含 `tool_name` 参数化分发和 `validateRowLevelPermission`。plan.md 正确识别此差异并注明为"基础版"，属合理裁剪。后续版本可升级为完整版。

---

## 3. 可执行性审查

### 3.1 依赖检查

| 依赖 | 可用性 | 评估 |
|------|--------|------|
| `multer` | `package.json` 是否有？待确认 | **风险**：若未安装 multer，执行 Task 4 前需 `npm install multer`。task_v1 Task 4.1 已标注检查。建议 plan.md 补充此依赖 |
| `better-sqlite3` | database.js 已使用 | 通过 |
| `bcryptjs` | database.js 已使用 | 通过 |
| `jsonwebtoken` | auth.js 已使用 | 通过 |
| `dotenv` | database.js 已使用 | 通过 |
| `static/uploads/avatars/` 目录 | 不保证存在 | upload.js 已提供 `fs.mkdirSync({ recursive: true })`，通过 |

### 3.2 任务顺序合理性

```
Task 1 (DIFY_BASE) → Task 3 (articles generate, 依赖 difyService)
Task 2 (validators) → Task 3 (articles generate, 依赖 validators)
Task 4 (upload) — 独立
Task 5 (admin logs) — 独立
Task 6 (admin execute) — 独立
Task 7 (index.js 挂载) → 依赖 Task 4, 5, 6 的文件存在
Task 8 (验收) → 依赖全部
```

**评估**：顺序合理。Task 5/6 可同文件并行或依次执行（同文件 admin.js），task_v1 建议 Task 5/6 在同文件追加。

### 3.3 时间估算

| Task | 预估时间 | 评价 |
|------|---------|------|
| Task 1 | 2 min | 两行改动 |
| Task 2 | 3 min | 一个校验函数 |
| Task 3 | 20 min | 核心逻辑 + 两阶段 + Mock |
| Task 4 | 15 min | multer 配置 + 错误处理 |
| Task 5 | 10 min | 两条 SQL + JOIN |
| Task 6 | 15 min | 安全校验 + 日志记录 |
| Task 7 | 2 min | 两行代码 |
| Task 8 | 15 min | 验收 |
| **总计** | **~82 min** | 预留 buffer 约 90-120 min，合理 |

---

## 4. 评审发现与建议修改

### 4.1 发现 1：articles.js Mock 降级与 difyService Mock 可能冲突（低风险）

**现状**：`difyService.js` 当 `DIFY_API_BASE` 为空时返回 `MOCK_PLAN_DATA`（方案 Mock 数据）。`articles.js` 调用 `callWorkflowBlocking(DIFY_ARTICLE_WORKFLOW_KEY, inputs)` 后得到方案 Mock 数据，解析文章会失败。

**建议**：在 `difyService.js` 的 Mock 模式中，增加对 articles 类型 inputs 的识别逻辑（如 `inputs.category` 存在时返回文章 Mock 数据），或在 `articles.js` 层检测 Dify API 不可用后直接使用 articles 层 Mock 数据。

**影响**：plan.md Step 3.3.3 已描述"articles.js 层做 Mock 降级"，但未明确 difyService Mock 返回的 PLAN 数据如何处理。task_v1 Task 3.3.3 已明确：若响应无法解析 → 使用硬编码 Mock。**可接受**。

### 4.2 发现 2：`upload.js` 路由路径为 `/avatar` 还是 `/upload/avatar`（无风险）

**现状**：`index.js` 挂载 `router.use('/upload', require('./upload'))` 后，`upload.js` 内部定义 `router.post('/avatar', ...)` → 实际路径为 `POST /api/upload/avatar`，与需求一致。**通过**。

### 4.3 发现 3：admin/execute 安全校验用 `toUpperCase()` 包含（中低风险）

**现状**：`trimmed.includes('INSERT')` 在大写后检查。但 `SELECT/*DROP*/1` 这种注释注入无法检测。

**评估**：批次文档明确"两天内仅实现 SELECT 基础版"，设计文档第 10 节将"SQL 白名单解析器"列为延期项。当前禁词黑名单策略满足批次要求。**通过**。

### 4.4 建议 4：plan.md 缺少 multer 包依赖声明

建议在 plan.md 第 4 步（创建 upload.js）中增加一行：
```
- 前置：确认 multer 已安装（`npm ls multer`），否则 `npm install multer`
```

---

## 5. 最终评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 需求覆盖 | 100% | 6 个模块全覆盖 |
| 设计对齐 | 95% | admin/execute 基础版是合理裁剪 |
| 安全 | 85% | 禁词黑名单可工作但非彻底，这是设计层面的折衷 |
| 可执行 | 90% | 依赖 multer 需确认安装 |
| 文档质量 | 95% | 任务拆分细致，验证步骤明确 |

**结论**：计划文档覆盖完整、任务拆分合理、安全策略符合批次设计意图。**APPROVED**，附带上述 4 条建议（均为非阻塞建议）。
