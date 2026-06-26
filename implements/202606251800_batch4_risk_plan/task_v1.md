# Task 1: difyService.js — Dify Blocking 工作流封装

## 目标
创建 `server/services/difyService.js`, 实现 `callWorkflowBlocking(apiKey, inputs)` 函数, 封装对 Dify `/workflows/run` 的 blocking 模式调用。

## 文件
- **新建**: `server/services/difyService.js`
- **依赖**: 无 (独立模块)

## 实现内容

### 1. callWorkflowBlocking(apiKey, inputs)

```js
const DIFY_API_BASE_URL = process.env.DIFY_API_BASE_URL;

async function callWorkflowBlocking(apiKey, inputs) {
  // ...
}
```

**输入**: 
- `apiKey` (string): Dify 工作流 API Key, 由调用方从环境变量传入
- `inputs` (object): 工作流输入变量, 键值对

**流程**:
1. POST `{DIFY_API_BASE_URL}/workflows/run`
   - Headers: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`
   - Body: `{ inputs, response_mode: 'blocking', user: 'api-user' }`
2. 超时: 连接 15s + 读取 15s (axios timeout: 15000)
3. 响应状态码非 2xx → 按映射表抛出 AppError:
   - 400 → `new AppError(422, 'VALIDATION_ERROR', ...)`
   - 401 → `new AppError(502, 'DIFY_ERROR', 'Dify API Key 无效')`
   - 404 → `new AppError(502, 'DIFY_ERROR', '应用/工作流不存在')`
   - 429 → `new AppError(429, 'RATE_LIMITED', '请求过于频繁')`
   - 500+ → `new AppError(502, 'DIFY_ERROR', 'Dify 服务内部错误')`
   - 超时 (ECONNABORTED/ETIMEDOUT) → `new AppError(504, 'AI_TIMEOUT', 'AI 服务响应超时')`
   - 网络错误 → `new AppError(502, 'DIFY_ERROR', '无法连接 AI 服务')`
4. 正常响应 → 返回 `response.data` (Dify 原始 JSON)

**不自动重试** (需求 7.3 节)。

### 2. Mock 兜底

当 `DIFY_API_BASE_URL` 未配置时 (`!DIFY_API_BASE_URL`), 返回 Mock 数据:

**风险预测 Mock**:
```json
{
  "data": {
    "outputs": {
      "text": "{\"risk_score\":15,\"risk_level\":\"medium\",\"risk_level_label\":\"中风险\",\"risk_level_detail\":\"根据评分体系，您的评分为15分，属于中风险人群。\",\"diabetes_type\":\"type2\",\"matched_diabetes_type\":\"2型糖尿病\",\"suggestions\":[\"建议调整饮食结构\",\"增加运动量\",\"定期监测血糖\"],\"bmi\":25.95}"
    }
  }
}
```

**方案生成 Mock**:
```json
{
  "data": {
    "outputs": {
      "text": "[{\"plan_type\":\"diet\",\"order_num\":1,\"time_desc\":\"7:00-8:00\",\"title\":\"燕麦粥 + 水煮蛋\",\"content\":\"燕麦50g...\"},{\"plan_type\":\"diet\",\"order_num\":2,\"time_desc\":\"12:00-13:00\",\"title\":\"杂粮饭 + 清蒸鱼\",\"content\":\"杂粮饭150g...\"},{\"plan_type\":\"diet\",\"order_num\":3,\"time_desc\":\"18:00-19:00\",\"title\":\"蔬菜沙拉 + 鸡胸肉\",\"content\":\"生菜100g...\"},{\"plan_type\":\"diet\",\"order_num\":4,\"time_desc\":\"15:00-15:30\",\"title\":\"坚果 + 无糖酸奶\",\"content\":\"核桃3个...\"},{\"plan_type\":\"exercise\",\"order_num\":1,\"time_desc\":\"6:30-7:00\",\"title\":\"晨间快走\",\"content\":\"快走30分钟...\"},{\"plan_type\":\"exercise\",\"order_num\":2,\"time_desc\":\"19:00-19:30\",\"title\":\"晚间散步\",\"content\":\"散步30分钟...\"},{\"plan_type\":\"exercise\",\"order_num\":3,\"time_desc\":\"8:00-9:00\",\"title\":\"周末太极\",\"content\":\"太极拳60分钟...\"}]"
    }
  }
}
```

Mock 模式通过 `console.log('[difyService] Mock mode: returning mock data')` 提示。

### 3. 注意事项
- 使用 axios 作为 HTTP 客户端 (项目已有, 参考前端)
- 若项目未使用 axios, 使用 Node.js 内置 `https`/`http` 模块
- 导出: `module.exports = { callWorkflowBlocking }`
- API Key 不在 difyService 内部硬编码, 由 Express 路由处理器从环境变量/数据库获取后传入

## 验收
1. 传入有效 apiKey + inputs, Dify 可达时返回真实响应
2. Dify 返回 401 时抛出 `AppError(502, 'DIFY_ERROR', ...)`
3. 请求超时时抛出 `AppError(504, 'AI_TIMEOUT', ...)`
4. DIFY_API_BASE_URL 未配置时返回 Mock 数据
5. 不自动重试
