# 糖尿病预治智能助手后端实现批次文档

> 文档类型：后端实现批次计划  
> 适用范围：Express + SQLite + Dify/DeepSeek 后端实现  
> 实施周期：2 天内完成后端最小可运行闭环  
> 批次数量：7 个实现批次  
> 目标版本：MVP Backend  
> 关联设计文档：`2_detailed_design_v3.md`

---

## 1. 文档目的

本文档用于指导“糖尿病预治智能助手”后端在两天内完成可运行版本的开发实施。

本实现计划不再按照“上午 / 下午 / 晚上”划分时间，而是按照**后端依赖关系和业务闭环顺序**划分为 7 个实现批次。每个批次都有明确目标、涉及模块、实现内容、交付物与验收标准。

总体实现主线如下：

```text
基础工程与数据库
→ 认证与用户体系
→ 公共业务数据接口
→ 风险预测与生活方案
→ 打卡与分析闭环
→ AI 对话与 SSE 代理
→ 扩展接口与统一验收
```

---

## 2. 批次总览

本项目后端建议分为 **7 个实现批次**。

| 批次 | 批次名称 | 核心目标 | 优先级 |
|---:|---|---|---|
| 第 1 批次 | 后端基础工程与数据库初始化 | 搭建 Express 后端骨架，完成 SQLite 初始化 | P0 |
| 第 2 批次 | 认证、鉴权与用户体系 | 完成注册、登录、JWT 鉴权、用户资料接口 | P0 |
| 第 3 批次 | 公共业务数据接口 | 完成医生、糖尿病类型、资讯文章等基础查询 | P0 |
| 第 4 批次 | 风险预测与生活方案核心闭环 | 完成风险预测、历史记录、方案生成、方案查询 | P0 |
| 第 5 批次 | 打卡记录与依从性分析闭环 | 完成方案打卡、打卡列表、基础分析 | P0 |
| 第 6 批次 | AI 对话与 SSE 流式代理 | 完成 Dify SSE 代理、医师对话、AI 助手对话 | P1 |
| 第 7 批次 | 扩展接口、管理基础与统一验收 | 完成文章生成、头像上传、管理日志、错误处理与最终联调 | P1 |

---

## 3. 实施优先级说明

### 3.1 P0：必须完成

P0 是两天内必须完成的功能。若 P0 未完成，系统后端不能形成完整主流程。

| 模块 | 内容 |
|---|---|
| 后端基础工程 | Express 启动、路由挂载、中间件注册 |
| 数据库初始化 | SQLite 建表、初始数据、索引、外键 |
| 认证体系 | 注册、登录、JWT、角色识别 |
| 用户接口 | 获取资料、修改资料、修改密码 |
| 公共查询 | 医生、文章、糖尿病类型 |
| 风险预测 | 提交健康数据、调用或 Mock AI、结果入库 |
| 生活方案 | 生成方案、查询当前方案、调整方案 |
| 打卡记录 | 新增打卡、查询打卡列表 |
| 打卡分析 | 基础完成率、趋势、建议 |
| 统一错误处理 | 错误码、HTTP 状态码、异常捕获 |

### 3.2 P1：应尽量完成

P1 是两天内应尽量完成的增强功能。

| 模块 | 内容 |
|---|---|
| SSE 流式代理 | 支持 Dify streaming 响应转发 |
| 医师对话 | `/api/chat/doctor/:id` |
| AI 助手 | `/api/assistant/chat` |
| 文章生成 | `/api/articles/generate` |
| 头像上传 | `/api/upload/avatar` |
| 文章收藏 | 收藏、取消收藏、收藏列表 |
| 管理日志 | 管理员查看操作日志 |

### 3.3 P2：可延期

P2 不建议放入两天内的关键路径。

| 模块 | 延期原因 |
|---|---|
| 完整 Text2SQL 工具链 | 安全校验复杂，容易拖慢主流程 |
| `tool_name` 参数化工具分发 | 依赖 Dify Agent 工具配置 |
| 行级权限 SQL 校验 | 实现成本高，需要充分测试 |
| Nginx + Keepalived 高可用 | 属于部署增强，不影响后端主闭环 |
| 医生 token AES-GCM 加密 | 可在最终安全加固阶段补充 |
| 高级限流与审计 | 可作为后续安全增强项 |

---

# 第 1 批次：后端基础工程与数据库初始化

## 1.1 批次目标

完成 Express 后端最小启动能力，并完成 SQLite 数据库初始化。该批次是后续所有接口开发的基础。

## 1.2 涉及文件

```text
server.js
server/app.js
server/db/database.js
server/db/init.sql
server/db/seed.sql
server/routes/index.js
server/middleware/errorHandler.js
.env
.env.example
```

## 1.3 实现内容

### 1.3.1 初始化后端依赖

安装基础依赖：

```bash
npm install express better-sqlite3 bcryptjs jsonwebtoken dotenv cors multer
npm install -D nodemon
```

### 1.3.2 配置环境变量

`.env` 至少包含：

```env
PORT=3000
JWT_SECRET=replace_with_random_secret
DB_PATH=./data/database.sqlite

DIFY_API_BASE=http://182.92.74.224/v1
DIFY_RISK_WORKFLOW_KEY=
DIFY_PLAN_WORKFLOW_KEY=
DIFY_ARTICLE_WORKFLOW_KEY=
DIFY_ASSISTANT_APP_KEY=
```

### 1.3.3 实现 Express 应用入口

要求：

- 支持 JSON 请求体解析
- 支持 CORS
- 支持 `/api/*` 路由挂载
- 支持 `/static/*` 静态资源访问
- 注册统一错误处理中间件
- 提供 `/api/health` 健康检查接口

### 1.3.4 实现数据库初始化

要求：

- 自动创建 `data/` 目录
- 自动创建 `database.sqlite`
- 开启 SQLite 外键约束
- 自动执行 `init.sql`
- 首次启动执行 `seed.sql`
- 导出统一 `db` 实例

关键配置：

```js
db.pragma('foreign_keys = ON');
```

### 1.3.5 建立核心数据表

至少建立以下表：

```text
users
doctor_information
articles
diabetes_types
article_collections
user_risk_info
life_plans
life_advice
punch_in
admin_logs
```

## 1.4 交付物

| 交付物 | 说明 |
|---|---|
| Express 服务 | 后端可正常启动 |
| SQLite 数据库文件 | `data/database.sqlite` 自动生成 |
| 初始化表结构 | 核心数据表存在 |
| 初始数据 | 管理员、医生、糖尿病类型、示例文章 |
| 健康检查接口 | `/api/health` 可访问 |

## 1.5 验收标准

- 后端服务启动无报错。
- `/api/health` 返回正常状态。
- 数据库文件自动生成。
- SQLite 中能查询到核心表。
- 初始医生、糖尿病类型、示例文章数据存在。

---

# 第 2 批次：认证、鉴权与用户体系

## 2.1 批次目标

完成用户登录态基础能力，使后续业务接口可以基于 JWT 识别当前用户，并区分普通用户和管理员。

## 2.2 涉及文件

```text
server/routes/auth.js
server/routes/user.js
server/middleware/auth.js
server/middleware/admin.js
server/utils/validators.js
server/utils/response.js
```

## 2.3 实现内容

### 2.3.1 JWT 鉴权中间件

从请求头读取：

```text
Authorization: Bearer <token>
```

解析成功后写入：

```js
req.user = {
  id,
  username,
  role
};
```

### 2.3.2 管理员校验中间件

管理员接口必须满足：

```text
用户已登录
并且 req.user.role === 'admin'
```

否则返回：

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "权限不足"
  }
}
```

### 2.3.3 注册接口

接口：

```text
POST /api/auth/register
```

要求：

- 用户名 3-50 字符
- 密码不少于 8 位，包含字母和数字
- 用户名唯一
- 密码使用 bcrypt 哈希
- 注册成功直接返回 JWT、role、user

### 2.3.4 登录接口

接口：

```text
POST /api/auth/login
```

要求：

- 校验用户名和密码
- 返回 `token`
- 返回 `role`
- 返回 `user`
- 管理员首次登录时返回 `must_change_password`

### 2.3.5 登出接口

接口：

```text
POST /api/auth/logout
```

JWT 采用无状态设计时，后端可直接返回成功，由前端负责清理 token 和本地状态。

### 2.3.6 用户资料接口

接口：

```text
GET /api/user/profile
PUT /api/user/profile
PUT /api/user/password
```

要求：

- 获取当前用户资料
- 支持修改用户名、头像
- 支持普通用户修改密码
- 支持管理员首次登录强制修改密码

## 2.4 交付物

| 交付物 | 说明 |
|---|---|
| 注册接口 | 新用户可注册 |
| 登录接口 | 用户可登录并获取 JWT |
| 鉴权中间件 | 可保护需要登录的接口 |
| 管理员中间件 | 可保护管理员接口 |
| 用户资料接口 | 可获取和修改个人资料 |
| 密码修改接口 | 支持普通修改和首次强制改密 |

## 2.5 验收标准

- 注册成功后能直接获得 token。
- 登录密码错误返回 401。
- 未携带 token 访问受保护接口返回 401。
- 携带有效 token 可访问 `/api/user/profile`。
- 非管理员访问管理员接口返回 403。
- 管理员首次登录时能识别 `must_change_password`。

---

# 第 3 批次：公共业务数据接口

## 3.1 批次目标

完成前端首页、资讯页、医生咨询页所需的公共数据接口，使系统具备基础内容展示能力。

## 3.2 涉及文件

```text
server/routes/doctors.js
server/routes/diabetes.js
server/routes/articles.js
server/utils/pagination.js
server/utils/jsonFields.js
```

## 3.3 实现内容

### 3.3.1 医生接口

接口：

```text
GET /api/doctors
GET /api/doctors/:id
```

要求：

- 支持分页
- 不返回 `chat_token`
- 医生不存在时返回 404

### 3.3.2 糖尿病类型接口

接口：

```text
GET /api/diabetes-types
GET /api/diabetes-types/:id
```

要求：

- 返回类型名称
- 返回图片
- 返回发病机制
- 返回临床表现
- 返回治疗方式

### 3.3.3 文章列表接口

接口：

```text
GET /api/articles
```

要求：

- 支持分页
- 支持按 `category` 筛选
- 公共文章只返回 `user_id IS NULL`
- `tags` 字段从 TEXT 转为 `string[]`
- 返回 `summary`、`views`、`created_at`

### 3.3.4 文章详情接口

接口：

```text
GET /api/articles/:id
```

要求：

- 返回 Markdown 正文 `content`
- 返回 `tags`
- 返回 `summary`
- 返回 `is_collected`
- 未登录用户 `is_collected` 为 `false`
- 文章不存在返回 404

### 3.3.5 文章收藏接口

接口：

```text
POST /api/articles/:id/collect
DELETE /api/articles/:id/collect
GET /api/articles/collections
```

要求：

- 收藏需要登录
- 防止重复收藏
- 取消收藏只能操作当前用户自己的收藏
- 收藏列表支持分页

## 3.4 交付物

| 交付物 | 说明 |
|---|---|
| 医生接口 | 首页和咨询页可用 |
| 糖尿病类型接口 | 首页类型卡片可用 |
| 文章列表接口 | 资讯页可用 |
| 文章详情接口 | 详情页可用 |
| 收藏接口 | 登录用户可收藏文章 |

## 3.5 验收标准

- `/api/doctors` 返回医生列表。
- `/api/diabetes-types` 返回糖尿病类型列表。
- `/api/articles` 返回公共文章，不混入用户私有文章。
- `/api/articles/:id` 返回 `content`、`tags`、`summary`、`is_collected`。
- 同一用户重复收藏同一文章时不会产生重复记录。

---

# 第 4 批次：风险预测与生活方案核心闭环

## 4.1 批次目标

完成系统最核心的 AI 业务闭环：用户提交健康信息后获得风险预测结果，并基于风险预测或用户偏好生成个性化生活方案。

核心闭环：

```text
用户填写健康信息
→ 风险预测
→ 预测结果入库
→ 生成生活方案
→ 方案入库
→ 查询当前方案
```

## 4.2 涉及文件

```text
server/services/difyService.js
server/routes/risk.js
server/routes/plan.js
server/utils/validators.js
server/utils/planParser.js
server/utils/response.js
```

## 4.3 实现内容

### 4.3.1 Dify Blocking 工作流封装

实现：

```js
callWorkflowBlocking(apiKey, inputs)
```

要求：

- 支持超时控制
- 支持 Dify 非 200 错误处理
- 支持解析 Dify 输出
- 支持 Mock 兜底

### 4.3.2 风险预测接口

接口：

```text
POST /api/risk/predict
GET /api/risk/history
```

`POST /api/risk/predict` 要求：

- 校验必填字段
- 枚举值统一使用英文小写
- `waist`、`systolic_bp` 不允许为 0
- `pregnancy` 写入 SQLite 时转换为 0/1
- 调用 Dify 风险预测工作流
- Dify 不可用时返回 Mock 结果
- 将结果写入 `user_risk_info`
- 返回 `risk_score`、`risk_level`、`risk_level_label`、`matched_diabetes_type`、`advice`、`created_at`

`GET /api/risk/history` 要求：

- 只返回当前用户记录
- 支持分页
- 计算 BMI
- 从 `result` JSON 中提取风险字段

### 4.3.3 生活方案生成接口

接口：

```text
POST /api/plan/generate
```

要求：

- 生成新的 `plan_id`
- 将当前用户旧方案设为 `is_active=0`
- 调用 Dify 生活方案工作流
- Dify 不可用时返回 Mock 方案
- 解析饮食、运动、其他方案项
- 写入 `life_plans`
- 返回 `diet_plans`、`exercise_plans`、`other_plans`

### 4.3.4 当前方案查询接口

接口：

```text
GET /api/plan/current
```

要求：

- 查询当前用户最新活跃方案
- 只返回一套当前方案
- 按 `plan_type` 和 `order_num` 排序
- 无方案时返回 `data: null`

### 4.3.5 方案调整接口

接口：

```text
PUT /api/plan/adjust
```

要求：

- 根据 `plan_id` 逻辑过期旧方案
- 根据用户反馈重新生成方案
- 写入新的方案组
- 返回新方案

## 4.4 交付物

| 交付物 | 说明 |
|---|---|
| Dify 工作流封装 | 可调用 blocking 工作流 |
| 风险预测接口 | 可提交健康信息并保存结果 |
| 风险历史接口 | 可查询历史预测 |
| 生活方案生成接口 | 可生成方案并入库 |
| 当前方案接口 | 可查询当前活跃方案 |
| 方案调整接口 | 可根据反馈重新生成方案 |

## 4.5 验收标准

- 登录用户可以提交风险预测。
- 风险预测结果保存到 `user_risk_info`。
- 用户可以生成生活方案。
- 旧方案会被逻辑过期。
- `/api/plan/current` 只返回一套当前活跃方案。
- Dify 不可用时，Mock 模式仍可返回结构正确的数据。

---

# 第 5 批次：打卡记录与依从性分析闭环

## 5.1 批次目标

完成用户执行生活方案后的打卡记录闭环，并提供基础依从性分析。

核心闭环：

```text
查询当前方案
→ 对方案项打卡
→ 查询打卡记录
→ 生成依从性分析
```

## 5.2 涉及文件

```text
server/routes/punch.js
server/utils/pagination.js
server/utils/dateRange.js
server/utils/response.js
```

## 5.3 实现内容

### 5.3.1 新增打卡接口

接口：

```text
POST /api/punch
```

要求：

- 登录后可用
- 校验 `plan_id`
- 校验方案项属于当前用户
- 校验 `punch_type` 只能为 `diet` 或 `exercise`
- 校验 `completion_status` 只能为 `completed` 或 `uncompleted`
- 写入 `punch_in`

### 5.3.2 打卡列表接口

接口：

```text
GET /api/punch/list
```

支持查询参数：

```text
page
pageSize
startDate
endDate
punch_type
```

要求：

- 只返回当前用户数据
- 支持日期范围筛选
- 支持类型筛选
- 关联 `life_plans.title` 作为 `plan_title`
- 返回统一分页结构

### 5.3.3 打卡分析接口

接口：

```text
GET /api/punch/analysis
```

第一版建议后端本地统计，不强依赖 Dify。

返回内容：

- 饮食完成率
- 运动完成率
- 总打卡次数
- 近 7 天趋势
- 依从性评语
- 改进建议

## 5.4 交付物

| 交付物 | 说明 |
|---|---|
| 打卡接口 | 用户可对饮食或运动方案打卡 |
| 打卡列表接口 | 用户可查询历史打卡记录 |
| 打卡分析接口 | 用户可查看依从性统计和建议 |

## 5.5 验收标准

- 用户能对自己的方案项打卡。
- 用户不能对其他用户的方案项打卡。
- `punch_type` 只接受 `diet` 和 `exercise`。
- 打卡列表分页正确。
- 日期筛选正确。
- 分析结果能返回完成率和近 7 天趋势。

---

# 第 6 批次：AI 对话与 SSE 流式代理

## 6.1 批次目标

完成 Dify 流式响应代理能力，并实现医师对话和全局 AI 助手对话接口。

## 6.2 涉及文件

```text
server/services/sseProxy.js
server/routes/chat.js
server/routes/assistant.js
server/services/difyService.js
```

## 6.3 实现内容

### 6.3.1 SSE 代理工具

实现：

```js
proxyDifySSE({ apiKey, query, conversationId, userId, res })
```

要求：

- 设置 `Content-Type: text/event-stream`
- 设置 `Cache-Control: no-cache`
- 设置 `Connection: keep-alive`
- 原样转发 Dify `data: {...}` 事件
- Dify 错误时返回 SSE error 事件
- 客户端断开时中止上游请求

### 6.3.2 医师对话接口

接口：

```text
POST /api/chat/doctor/:id
GET /api/chat/doctor/:id/conversations
```

要求：

- 根据医生 ID 查询医生
- 读取医生对应 Dify token
- 转发用户消息到 Dify
- 流式返回结果
- 不暴露医生 `chat_token`

历史会话列表第一版可先返回空数组：

```json
{
  "success": true,
  "data": []
}
```

### 6.3.3 AI 助手接口

接口：

```text
POST /api/assistant/chat
GET /api/assistant/advice
GET /api/assistant/conversations
```

要求：

- `/api/assistant/chat` 支持 SSE 流式返回
- `/api/assistant/advice` 查询 `life_advice`
- `/api/assistant/conversations` 第一版可返回空数组

## 6.4 交付物

| 交付物 | 说明 |
|---|---|
| SSE 代理工具 | 可转发 Dify streaming |
| 医师对话接口 | 可与指定医生对话 |
| AI 助手接口 | 可与全局助手对话 |
| 健康建议列表接口 | 可读取 `life_advice` |

## 6.5 验收标准

- 浏览器或 curl 能接收到 `data: {...}` 流式事件。
- 客户端断开不会造成后端请求悬挂。
- Dify 错误能以 SSE error 形式返回。
- 至少一个对话接口可以完成完整问答。
- 医生接口不会泄露 `chat_token`。

---

# 第 7 批次：扩展接口、管理基础与统一验收

## 7.1 批次目标

补齐主要扩展接口，并对所有接口进行统一收口、错误处理和联调验收，形成可交付后端版本。

## 7.2 涉及文件

```text
server/routes/articles.js
server/routes/upload.js
server/routes/admin.js
server/middleware/errorHandler.js
server/utils/pagination.js
server/utils/response.js
server/utils/validators.js
```

## 7.3 实现内容

### 7.3.1 AI 文章生成接口

接口：

```text
POST /api/articles/generate
```

要求：

- 未传 `category` 时返回推荐分类
- 传入 `category` 时调用 Dify 文章生成工作流
- 生成文章写入 `articles`
- 绑定当前 `user_id`
- 用户生成文章不进入公共列表
- 返回文章详情结构

### 7.3.2 头像上传接口

接口：

```text
POST /api/upload/avatar
```

要求：

- 使用 `multipart/form-data`
- 文件字段名为 `avatar`
- 仅允许 JPEG、PNG、WebP
- 文件大小不超过 2MB
- 保存至 `/static/uploads/avatars/`
- 返回头像 URL

### 7.3.3 管理日志接口

接口：

```text
GET /api/admin/logs
```

要求：

- 仅管理员可访问
- 支持分页
- 关联操作者用户名
- 按时间倒序返回

### 7.3.4 SQL 执行基础版

接口：

```text
POST /api/admin/execute
```

两天内建议只实现安全基础版：

- 仅管理员可访问
- 仅允许 `SELECT`
- 禁止 `INSERT`
- 禁止 `UPDATE`
- 禁止 `DELETE`
- 禁止 `DROP`
- 禁止 `ALTER`
- 记录操作日志

完整 Text2SQL 工具调用、行级权限约束和 `tool_name` 参数化分发放入后续版本。

### 7.3.5 统一错误处理

所有错误统一返回：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读的错误描述"
  }
}
```

必须覆盖：

| HTTP 状态码 | 错误码 | 场景 |
|---:|---|---|
| 400 | BAD_REQUEST | 请求格式错误 |
| 401 | AUTH_REQUIRED | 未登录或 Token 过期 |
| 401 | AUTH_INVALID | 用户名或密码错误 |
| 403 | FORBIDDEN | 权限不足 |
| 404 | NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 资源冲突 |
| 413 | FILE_TOO_LARGE | 文件过大 |
| 415 | UNSUPPORTED_FILE_TYPE | 文件类型不支持 |
| 422 | VALIDATION_ERROR | 参数校验失败 |
| 429 | RATE_LIMITED | 请求过于频繁 |
| 500 | INTERNAL_ERROR | 服务端内部错误 |
| 502 | DIFY_ERROR | Dify 服务错误 |
| 504 | AI_TIMEOUT | AI 接口超时 |

### 7.3.6 统一分页

所有列表接口统一：

```text
page 默认 1
pageSize 默认 20
pageSize 最大 100
offset = (page - 1) * pageSize
totalPages = Math.ceil(total / pageSize)
```

### 7.3.7 最终接口验收

建议按以下顺序验收：

```text
1. POST /api/auth/register
2. POST /api/auth/login
3. GET /api/user/profile
4. GET /api/doctors
5. GET /api/diabetes-types
6. GET /api/articles
7. GET /api/articles/:id
8. POST /api/risk/predict
9. GET /api/risk/history
10. POST /api/plan/generate
11. GET /api/plan/current
12. POST /api/punch
13. GET /api/punch/list
14. GET /api/punch/analysis
15. POST /api/chat/doctor/:id
16. POST /api/assistant/chat
17. POST /api/articles/generate
18. POST /api/upload/avatar
19. GET /api/admin/logs
```

## 7.4 交付物

| 交付物 | 说明 |
|---|---|
| AI 文章生成接口 | 可生成私有文章 |
| 上传接口 | 用户可上传头像 |
| 管理日志接口 | 管理员可查看操作日志 |
| SQL 查询基础版 | 管理员可执行安全 SELECT 查询 |
| 统一错误处理 | 所有异常格式一致 |
| 统一分页处理 | 所有列表接口结构一致 |
| 接口验收记录 | 主流程接口可运行 |

## 7.5 验收标准

- AI 文章生成后能在数据库中查到，且 `user_id` 不为空。
- 公共文章列表不会显示用户私有文章。
- 上传非图片文件返回 415。
- 上传超过 2MB 文件返回 413。
- 非管理员访问 `/api/admin/logs` 返回 403。
- SQL 基础版拒绝危险语句。
- 所有 P0 接口全部可用。
- 主要错误均返回统一格式。
- 后端主流程可以完整跑通。

---

## 8. 两天最终完成标准

两天内后端交付版本至少应满足以下标准：

```text
1. 后端可以正常启动。
2. 数据库可以自动初始化。
3. 用户可以注册和登录。
4. JWT 鉴权可用。
5. 用户可以获取和修改个人资料。
6. 首页所需医生、资讯、糖尿病类型接口可用。
7. 用户可以提交风险预测。
8. 风险预测结果可以入库并查询历史。
9. 用户可以生成生活方案。
10. 用户可以查看当前生活方案。
11. 用户可以对方案进行打卡。
12. 用户可以查询打卡列表。
13. 用户可以查看基础打卡分析。
14. 至少一个 Dify 工作流接口可用，或具备 Mock 兜底。
15. 至少一个 SSE 对话接口可用。
16. 接口错误格式统一。
17. 分页格式统一。
18. 管理员日志接口可用。
```

---

## 9. 建议延期到下一轮的增强项

| 增强项 | 说明 |
|---|---|
| 完整 Text2SQL 工具链 | 支持 Dify Agent 调用参数化工具和安全 SQL 执行 |
| 行级权限校验 | 普通用户只能访问本人数据 |
| SQL 白名单解析器 | 对动态 SQL 做更严格的语义分析 |
| 医生 token 加密 | 使用 AES-256-GCM 加密 Dify chat token |
| 请求限流 | 登录、AI 生成、上传接口增加限流 |
| 操作审计增强 | 记录 IP、User-Agent、请求参数摘要 |
| Dify 工作流失败重试 | 增加重试和降级策略 |
| 生产环境部署 | Nginx、HTTPS、PM2、Keepalived、高可用 |
| 自动化测试 | Jest/Supertest 覆盖核心接口 |
| OpenAPI 文档 | 输出 Swagger/Apifox 接口文档 |

---

## 10. 风险与应对

| 风险 | 影响 | 应对策略 |
|---|---|---|
| Dify 工作流未配置完成 | AI 接口无法返回真实结果 | 后端提供 Mock 兜底 |
| Text2SQL 安全风险高 | 可能误操作数据库 | 两天内仅实现 SELECT 基础版 |
| SSE 调试成本高 | 对话接口可能卡住 | 先完成一个可用 SSE 接口，再复制到其他场景 |
| 数据库字段与前端契约不一致 | 前后端联调失败 | 严格按英文枚举值和统一响应格式实现 |
| 文章 tags JSON 解析异常 | 列表接口报错 | JSON.parse 失败时降级为空数组 |
| 方案重复生成 | 数据出现多套活跃方案 | 生成新方案前统一过期旧方案 |
| 打卡关联错误 | 用户打卡到他人方案 | 新增打卡前校验方案归属 |
| 两天时间不足 | 影响交付 | 保 P0，P1 尽量完成，P2 延期 |

---

## 11. 推荐后端目录结构

```text
server/
├── app.js
├── db/
│   ├── database.js
│   ├── init.sql
│   └── seed.sql
├── middleware/
│   ├── auth.js
│   ├── admin.js
│   ├── difyAuth.js
│   └── errorHandler.js
├── routes/
│   ├── index.js
│   ├── auth.js
│   ├── user.js
│   ├── doctors.js
│   ├── chat.js
│   ├── risk.js
│   ├── plan.js
│   ├── punch.js
│   ├── articles.js
│   ├── diabetes.js
│   ├── assistant.js
│   ├── admin.js
│   ├── dify.js
│   └── upload.js
├── services/
│   ├── difyService.js
│   └── sseProxy.js
└── utils/
    ├── response.js
    ├── pagination.js
    ├── validators.js
    ├── jsonFields.js
    ├── dateRange.js
    └── planParser.js
```

---

## 12. 结论

本后端实现计划共划分为 **7 个批次**。

推荐实现顺序为：

```text
第 1 批次：后端基础工程与数据库初始化
第 2 批次：认证、鉴权与用户体系
第 3 批次：公共业务数据接口
第 4 批次：风险预测与生活方案核心闭环
第 5 批次：打卡记录与依从性分析闭环
第 6 批次：AI 对话与 SSE 流式代理
第 7 批次：扩展接口、管理基础与统一验收
```

该划分方式去除了“上中下午”的时间段描述，更适合实际开发中按依赖关系推进。两天内应优先保证第 1 至第 5 批次全部完成，第 6 批次至少完成一个可用 SSE 对话接口，第 7 批次完成主要扩展接口和最终验收收口。

最终交付时，应保证 P0 功能稳定可用，P1 功能尽量完成，P2 功能作为后续增强项处理。
