# 设计审查报告（v2 r3）

## 审查结果
REJECTED

## 发现

### 发现1 [一般] — 任务文件导出指令与设计文件的方案 B 矛盾

**位置**：`task_v2.md` 第 14 行

**问题**：任务文件明确写有 `导出 { router, proxyAgentSSE, AGENT_KEYS }`，要求以普通 Object 形式导出三个成员。但设计文件（detail_v2.md）经 r2 修订后已采用**方案 B**：`module.exports = router`（以 Router 实例为主导出），`proxyAgentSSE` 和 `AGENT_KEYS` 仅作为 Router 的属性挂载。

**为何是问题**：若实现者遵循任务文件的导出指令，`require('./dify')` 将返回一个普通 Object 而非 Router 函数。`index.js` 中 `router.use('/dify', require('./dify'))` 会因 Express 要求第二个参数为函数而抛出 `TypeError: fn is not a function`。这正是设计文件 r2 修订中 发现1 [严重] 所修复的问题——任务文件未随设计 r2 同步更新，保留了已被判定为错误的导出指令，构成回归风险。

**证据**：项目现有 13 个路由模块（`assistant.js:80`、`chat.js:57`、`admin.js:493` 等）全部使用 `module.exports = router` 直接导出 Router 实例。设计文件的方案 B 与此约定一致，任务文件的指令则与之冲突。

**修改方向**：将 `task_v2.md` 第 14 行从 `导出 { router, proxyAgentSSE, AGENT_KEYS }` 修改为与方案 B 一致的描述，例如：
```
导出 Router 实例（module.exports = router），proxyAgentSSE 函数和 AGENT_KEYS 常量作为 Router 的属性挂载（router.proxyAgentSSE / router.AGENT_KEYS），调用方通过解构 const { proxyAgentSSE } = require('./dify') 获取。
```

---

### 发现2 [一般] — 任务文件错误处理伪代码混淆环境变量名与值

**位置**：`task_v2.md` 第 67-73 行

**问题**：任务文件 r1 修订新增的错误处理伪代码存在逻辑缺陷：

```javascript
const apiKey = AGENT_KEYS[req.params.agent_id];
if (!apiKey) {
  return res.status(400).json({...});
}
```

`AGENT_KEYS['diabetes-assistant-agent']` 返回的是环境变量**名称**字符串 `'DIFY_ASSISTANT_APP_KEY'`（truthy），而非环境变量的**值**（即实际 API Key）。该伪代码将环境变量名赋值给名为 `apiKey` 的变量，缺少 `process.env[envKey]` 这一关键查值步骤。

**为何是问题**：若实现者逐字遵循此伪代码，最终传入 `proxyAgentSSE({ apiKey, ... })` 的将是字符串 `"DIFY_ASSISTANT_APP_KEY"` 而非实际密钥值，上游 Dify 将收到 `Authorization: Bearer DIFY_ASSISTANT_APP_KEY`（环境变量名作为令牌），请求必然失败。此外，完整的路由处理流程还包括 message 校验和 `proxyAgentSSE` 调用，伪代码片段截断在 agent_id 查表处，未展示后续步骤，整体流程不完整。

**对照**：设计文件（detail_v2.md 第 131-137 行）的正确伪代码使用两个独立变量——`envKey`（环境变量名，用于查表和校验）和 `apiKey`（环境变量值，用于传入 proxyAgentSSE）——语义清晰，不存在混淆。

**修改方向**：将 task_v2.md 第 67-73 行的伪代码修正为与设计文件一致的两步形式：
```javascript
const envKey = AGENT_KEYS[req.params.agent_id];
if (!envKey) {
  return res.status(400).json({
    error: { code: 'INVALID_AGENT', message: '未知的 Agent 标识' }
  });
}
const apiKey = process.env[envKey];
```
并将变量名从 `apiKey` 改为 `envKey` 以避免误导。

---

## 修改要求

以上 2 条均为 [一般] 级别，必须修正后重新审查。

### 针对发现1

修改 `task_v2.md` 第 14 行（以及"预期产出"表中 `dify.js` 行的"核心内容"列），将导出描述从普通 Object 解构改为方案 B（Router 主导出 + 属性挂载），与设计文件保持一致。

### 针对发现2

修改 `task_v2.md` 第 67-73 行的错误处理伪代码，补充 `process.env[envKey]` 查值步骤，并将变量名从 `apiKey` 改为 `envKey`，使其与设计文件的路由处理器伪代码语义一致。
