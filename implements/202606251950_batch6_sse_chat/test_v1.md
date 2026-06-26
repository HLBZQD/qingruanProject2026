# test_v1.md — batch6 SSE Chat 验收测试计划 v1

## 测试环境
- 数据库: data/database.sqlite (清空重建)
- 服务器: node server.js, 端口 3000
- 当前模式: Mock 模式 (DIFY_API_BASE_URL 未设置，因为 .env 中变量名为 DIFY_API_BASE 而非 DIFY_API_BASE_URL)
- 测试用户: vtest1

## 测试步骤

### Step 1: 删旧数据库，重启服务
- 删除 data/database.sqlite
- 启动 node server.js
- 预期: 数据库重建，种子数据插入（admin + 3 doctors + diabetes_types + articles）

### Step 2: 注册用户
- POST /api/auth/register vtest1
- 预期: 201 Created, 返回 token + user 信息

### Step 3: 登录获取 Token
- POST /api/auth/login vtest1
- 预期: 200 OK, 返回 token

### Step 4: GET /api/chat/doctor/1/conversations
- 带 Authorization Bearer token
- 预期: 200 OK, { success: true, message: "查询成功", data: [] }

### Step 5: GET /api/assistant/conversations
- 带 Authorization Bearer token
- 预期: 200 OK, { success: true, message: "查询成功", data: [] }

### Step 6: GET /api/assistant/advice?page=1&pageSize=20
- 带 Authorization Bearer token
- 预期: 200 OK, 返回 data + pagination 字段，tags 为解析后的数组格式

### Step 7: POST /api/chat/doctor/1 SSE 流式对话
- 带 Authorization Bearer token
- Body: {"message":"你好"}
- 预期:
  - Content-Type: text/event-stream
  - Cache-Control: no-cache
  - Connection: keep-alive
  - X-Accel-Buffering: no
  - 收到 data: {"event":"message",...} 和 data: {"event":"message_end",...}
  - SSE 输出中不包含 chat_token / apiKey / PLACEHOLDER

### Step 8: POST /api/chat/doctor/999 (不存在的医生)
- 预期: 404, { error: { code: "NOT_FOUND", message: "医生不存在" } }

### Step 9: POST /api/chat/doctor/1 (空消息)
- Body: {"message":""}
- 预期: 422, { error: { code: "VALIDATION_ERROR", message: "消息不能为空" } }

### Step 10: POST /api/chat/doctor/1 (无 token)
- 不带 Authorization header
- 预期: 401, { error: { code: "AUTH_REQUIRED", message: "未登录或Token已过期" } }

### Step 11: POST /api/assistant/chat SSE 流式对话
- 带 Authorization Bearer token
- Body: {"message":"你好呀"}
- 预期: Content-Type: text/event-stream, 收到 Mock SSE 事件

### Step 12: SSE 带 conversation_id 参数
- POST /api/chat/doctor/1, Body: {"message":"继续","conversation_id":"mock-001"}
- 预期: 正常返回 Mock SSE，不报错

## 验收标准对照

| 验收标准 | 对应测试步骤 |
|----------|-------------|
| curl 能接收到 data: {...} 流式事件 | Step 7, Step 11 |
| 客户端断开不造成后端请求悬挂 | 代码层面验证 req.on('close') |
| Dify 错误能以 SSE error 形式返回 | 代码层面验证 writeErrorEvent + DIFY_ERROR/UPSTREAM_ERROR |
| 至少一个对话接口可完成完整问答 | Step 7 (医生对话), Step 11 (AI助手) |
| 医生接口不泄露 chat_token | Step 7 (SSE 输出不含 chat_token) |
