# 设计审查报告（v2 r2）

## 审查结果
REJECTED

## 发现

### [严重] — `index.js` 和测试 `createApp()` 中模块引用方式与导出形态不兼容，导致路由无法挂载

`detail_v2.md` 定义 `dify.js` 导出 `module.exports = { router, proxyAgentSSE, AGENT_KEYS }`（一个普通 JavaScript 对象），但 `index.js` 修改和测试 `createApp()` 中使用了 `require('./dify')` 后直接作为中间件/路由挂载：

- `index.js`：`router.use('/dify', require('./dify'))`
- 测试：`app.use(require('../../server/routes/dify'))`

Express 的 `router.use([path], fn)` 要求第二个参数为函数（Express Router 实例本质上是一个可调用的函数）。而 `require('./dify')` 返回 `{ router, proxyAgentSSE, AGENT_KEYS }`（普通 Object），不是一个函数。当 Express 内部尝试调用 `fn(req, res, next)` 时，会抛出 `TypeError: fn is not a function`，导致：

1. 服务启动后所有 `/api/dify/agent/:agent_id` 请求无法正确路由；
2. 测试中 `createApp()` 创建的 app 无法挂载路由，supertest 请求全部返回 404 或直接报错。

**问题根因**：现有项目中所有 13 个 `server/routes/*.js` 模块均使用 `module.exports = router` 直接导出 Router 实例（已验证 assistant.js:80、chat.js:57、admin.js:493 等），因此 `index.js` 中 `router.use('/assistant', require('./assistant'))` 模式有效。`dify.js` 因需要额外导出 `proxyAgentSSE` 和 `AGENT_KEYS` 而改为导出 Object，打破了这一约定，但 `index.js` 修改未相应使用 `.router` 解引用。

**修正方向**：方案 A — `index.js` 改为 `router.use('/dify', require('./dify').router)`，测试改为 `app.use(require('../../server/routes/dify').router)`，同时建议在所有涉及 `require('./dify')` 的位置补充注释说明为何此处需 `.router`（区别于其他路由模块）。方案 B — 保持 `dify.js` 以 Router 为主导出，将 `proxyAgentSSE` 和 `AGENT_KEYS` 作为 Router 的属性挂载（`router.proxyAgentSSE = ...; router.AGENT_KEYS = ...; module.exports = router`），这样 `index.js` 的 `require('./dify')` 无需修改，`assistant.js` 的 `const { proxyAgentSSE } = require('./dify')` 同样有效。方案 B 更好（保持与所有现有路由模块的导出约定一致），但需相应更新设计文档中模块导出关系图和所有 `require` 示例。

### [轻微] — 测试 `createApp()` 示例代码未包含错误处理中间件，与注意事项矛盾

设计文档测试章节的"注意"明确指出：路由处理器中 `try/catch` 的同步异常通过 `next(e)` 传递给 Express 默认错误处理，"在测试 app 中需显式添加 `(err, req, res, next) => res.status(500).json({ error: { message: err.message } })` 错误处理中间件以防超时"。但紧随其后的 `createApp()` 示例代码中并未包含此中间件：

```javascript
function createApp() {
  const app = express();
  app.use(express.json());
  app.use(require('../../server/routes/dify'));
  return app;
}
```

若测试触发未捕获的同步异常（例如路由处理器内部的 `req.user.user_id` 访问在 mock 未正确设置时抛出 TypeError），supertest 请求将挂起直至超时（默认 5 秒），而非返回明确的 500 错误响应，增加调试成本。

**修正方向**：在 `createApp()` 示例代码中 `app.use(require(...))` 之后、`return app` 之前添加错误处理中间件，使其与注意事项保持一致。

### [轻微] — `assistant.js` 中 `apiKey` 硬编码绕过了 `AGENT_KEYS` 映射，存在配置漂移风险

`assistant.js` 的 `/chat` 路由直接使用 `apiKey: process.env.DIFY_ASSISTANT_APP_KEY`（硬编码环境变量名），而新增的 `POST /agent/diabetes-assistant-agent` 路由通过 `AGENT_KEYS['diabetes-assistant-agent']` → `process.env[envKey]` 间接读取同一个环境变量。两者读取同一配置值但路径不同——若未来有人修改 `AGENT_KEYS` 的映射值（例如将 diabetes-assistant-agent 的 env var 名改为 `DIFY_NEW_KEY`），`/chat` 路由的硬编码不会同步更新，导致两个入口使用不同的 API Key，产生行为分裂。

当前设计将此视为"便利入口"的有意设计，且 `/chat` 作为前端唯一入口，硬编码简化了代码。但应在设计中标注：`assistant.js` 第 21 行的 `DIFY_ASSISTANT_APP_KEY` 必须与 `AGENT_KEYS['diabetes-assistant-agent']` 指向同一个环境变量，任何一方修改需同步另一方。或提供注释引用（如 `// 必须与 dify.js 中 AGENT_KEYS['diabetes-assistant-agent'] 的环境变量名一致`）。

## 修改要求

1. **【严重】模块导出与引用不兼容**：将 `dify.js` 的导出方式从 `module.exports = { router, proxyAgentSSE, AGENT_KEYS }` 改为以 Router 为主导出的形式（推荐方案 B：`module.exports = router` + 属性挂载），或修改所有引用处为 `.router` 解引用（方案 A）。推荐方案 B，因其保持与项目现有 13 个路由模块完全一致的导出约定，且不影响 `assistant.js` 中的解构导入。

2. **【轻微】测试 createApp 示例**：在示例代码中添加 Express 错误处理中间件，消除代码与注意事项之间的矛盾。

3. **【轻微】assistant.js 硬编码标注**：在 `assistant.js` 的 `apiKey: process.env.DIFY_ASSISTANT_APP_KEY` 处或设计文档相关章节添加同步注释，防止未来 AGENT_KEYS 修改时遗漏此硬编码。
