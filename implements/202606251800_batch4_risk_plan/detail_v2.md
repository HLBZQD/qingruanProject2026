# detail_v2.md — 风险预测与生活方案核心闭环 技术规格

> 基于 `task_v1.md` / `plan.md` / `2_detailed_design_v3.md` 第 3.2.7–3.2.15 节及第 5 章
> 
> **v2 变更**: 修复 POST /api/plan/generate 和 PUT /api/plan/adjust 响应中方案项缺少 `id` 字段的问题（见 5.3 Step 7a / 5.4 Step 7a）。

---

## 1. server/services/difyService.js

### 1.1 依赖与环境变量

| 变量 | 用途 |
|------|------|
| `process.env.DIFY_API_BASE_URL` | Dify API 基地址，例 `http://10.0.0.10/v1` |
| 调用方提供的 `apiKey` 参数 | 由 Express 路由从环境变量按功能选取传入（不在本模块内硬编码） |

HTTP 客户端：使用 Node.js 内置 `http`/`https` 模块（项目 server 端 `package.json` 未包含 `axios` 依赖）。如果后续安装 `axios`，可替换实现。

### 1.2 函数签名

```js
/**
 * 以 blocking 模式调用 Dify /workflows/run 端点
 * @param {string} apiKey   Dify 工作流 API Key
 * @param {object} inputs   工作流输入变量（键值对）
 * @returns {object}        Dify 原始响应 JSON 的 response.data
 * @throws {AppError}       按 1.5 节映射表抛出
 */
async function callWorkflowBlocking(apiKey, inputs)
```

导出：
```js
module.exports = { callWorkflowBlocking };
```

### 1.3 内部流程（伪代码）

```
callWorkflowBlocking(apiKey, inputs):
  1. 若 DIFY_API_BASE_URL 为空或 undefined → 返回 Mock 数据（见 1.4 节）
  2. 构造请求体:
      POST {DIFY_API_BASE_URL}/workflows/run
      Headers: Authorization: Bearer {apiKey}
               Content-Type: application/json
      Body:   { inputs: {inputs}, response_mode: "blocking", user: "api-user" }
  3. 使用 http/https.request，设置 timeout = 15000ms (连接+读取合计)
      通过 AbortSignal.timeout(15000) 或 socket.setTimeout(15000) 实现
  4. 读取响应体，解析 JSON
      状态码 2xx → 返回 response.data
      状态码 非2xx → 按 1.5 节映射表抛出 AppError
  5. 捕获超时错误（ECONNABORTED / ETIMEDOUT / AbortError）→ 抛出 AppError(504, 'AI_TIMEOUT', …)
      捕获网络错误（ENOTFOUND / ECONNREFUSED / etc）→ 抛出 AppError(502, 'DIFY_ERROR', …)
```

### 1.4 Mock 数据（完整 JSON 结构）

当 `!DIFY_API_BASE_URL` 时直接返回，不发起 HTTP 请求。console.log 提示 `[difyService] Mock mode: returning mock data`。

#### 1.4.1 风险预测 Mock（diabetes-risk-prediction）

```json
{
  "data": {
    "id": "mock-workflow-run-id-risk",
    "workflow_id": "mock-workflow-risk",
    "status": "succeeded",
    "outputs": {
      "text": "{\"risk_score\":15,\"risk_level\":\"medium\",\"risk_level_label\":\"中风险\",\"risk_level_detail\":\"根据评分体系，您的评分为15分，属于中风险人群。\",\"diabetes_type\":\"type2\",\"matched_diabetes_type\":\"2型糖尿病\",\"suggestions\":[\"建议调整饮食结构\",\"增加运动量\",\"定期监测血糖\"],\"bmi\":25.95}"
    },
    "error": null,
    "elapsed_time": 0.5,
    "total_tokens": 0,
    "total_steps": 0,
    "created_at": 1719244800
  }
}
```

**outputs.text 内层 JSON（解析后）**：
```json
{
  "risk_score": 15,
  "risk_level": "medium",
  "risk_level_label": "中风险",
  "risk_level_detail": "根据评分体系，您的评分为15分，属于中风险人群。",
  "diabetes_type": "type2",
  "matched_diabetes_type": "2型糖尿病",
  "suggestions": [
    "建议调整饮食结构",
    "增加运动量",
    "定期监测血糖"
  ],
  "bmi": 25.95
}
```

#### 1.4.2 方案生成 Mock（life-plan-generator）

```json
{
  "data": {
    "id": "mock-workflow-run-id-plan",
    "workflow_id": "mock-workflow-plan",
    "status": "succeeded",
    "outputs": {
      "text": "[{\"plan_type\":\"diet\",\"order_num\":1,\"time_desc\":\"7:00-8:00\",\"title\":\"燕麦粥 + 水煮蛋\",\"content\":\"燕麦50g，加水煮粥；鸡蛋1个水煮；黄瓜100g切丝凉拌，少油少盐。\"},{\"plan_type\":\"diet\",\"order_num\":2,\"time_desc\":\"12:00-13:00\",\"title\":\"杂粮饭 + 清蒸鱼\",\"content\":\"杂粮饭150g，清蒸鲈鱼100g，清炒时蔬200g。\"},{\"plan_type\":\"diet\",\"order_num\":3,\"time_desc\":\"18:00-19:00\",\"title\":\"蔬菜沙拉 + 鸡胸肉\",\"content\":\"生菜100g、西红柿1个、鸡胸肉100g，橄榄油5ml，醋适量。\"},{\"plan_type\":\"diet\",\"order_num\":4,\"time_desc\":\"15:00-15:30\",\"title\":\"坚果 + 无糖酸奶\",\"content\":\"核桃3个，无糖酸奶200ml。\"},{\"plan_type\":\"exercise\",\"order_num\":1,\"time_desc\":\"6:30-7:00\",\"title\":\"晨间快走\",\"content\":\"快走30分钟，速度5-6km/h，心率控制在120次/分以内。\"},{\"plan_type\":\"exercise\",\"order_num\":2,\"time_desc\":\"19:00-19:30\",\"title\":\"晚间散步\",\"content\":\"散步30分钟，饭后1小时进行。\"},{\"plan_type\":\"exercise\",\"order_num\":3,\"time_desc\":\"8:00-9:00\",\"title\":\"周末太极\",\"content\":\"太极拳60分钟，注意膝盖保护，避免深蹲动作。\"}]"
    },
    "error": null,
    "elapsed_time": 0.8,
    "total_tokens": 0,
    "total_steps": 0,
    "created_at": 1719244800
  }
}
```

**outputs.text 内层 JSON（解析后）** — 7 项数组（diet × 4 + exercise × 3）：

```json
[
  {"plan_type":"diet","order_num":1,"time_desc":"7:00-8:00","title":"燕麦粥 + 水煮蛋","content":"燕麦50g，加水煮粥；鸡蛋1个水煮；黄瓜100g切丝凉拌，少油少盐。"},
  {"plan_type":"diet","order_num":2,"time_desc":"12:00-13:00","title":"杂粮饭 + 清蒸鱼","content":"杂粮饭150g，清蒸鲈鱼100g，清炒时蔬200g。"},
  {"plan_type":"diet","order_num":3,"time_desc":"18:00-19:00","title":"蔬菜沙拉 + 鸡胸肉","content":"生菜100g、西红柿1个、鸡胸肉100g，橄榄油5ml，醋适量。"},
  {"plan_type":"diet","order_num":4,"time_desc":"15:00-15:30","title":"坚果 + 无糖酸奶","content":"核桃3个，无糖酸奶200ml。"},
  {"plan_type":"exercise","order_num":1,"time_desc":"6:30-7:00","title":"晨间快走","content":"快走30分钟，速度5-6km/h，心率控制在120次/分以内。"},
  {"plan_type":"exercise","order_num":2,"time_desc":"19:00-19:30","title":"晚间散步","content":"散步30分钟，饭后1小时进行。"},
  {"plan_type":"exercise","order_num":3,"time_desc":"8:00-9:00","title":"周末太极","content":"太极拳60分钟，注意膝盖保护，避免深蹲动作。"}
]
```

### 1.5 错误码映射表

| 条件 | 抛出 AppError | 说明 |
|------|--------------|------|
| Dify 返回 HTTP 400 | `new AppError(422, 'VALIDATION_ERROR', responseBody?.message \|\| '请求参数校验失败')` | Dify invalid_param → Express 422 |
| Dify 返回 HTTP 401 | `new AppError(502, 'DIFY_ERROR', 'Dify API Key 无效')` | unauthorized |
| Dify 返回 HTTP 404 | `new AppError(502, 'DIFY_ERROR', '应用/工作流不存在')` | app_not_found |
| Dify 返回 HTTP 429 | `new AppError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试')` | too_many_requests |
| Dify 返回 HTTP 500+ | `new AppError(502, 'DIFY_ERROR', 'Dify 服务内部错误')` | internal_error |
| 请求超时（ECONNABORTED / ETIMEDOUT / AbortError） | `new AppError(504, 'AI_TIMEOUT', 'AI 服务响应超时，请稍后重试')` | connection 或 read timeout |
| 网络错误（ENOTFOUND / ECONNREFUSED / 其他网络异常） | `new AppError(502, 'DIFY_ERROR', '无法连接 AI 服务')` | DNS/连接失败 |
| 响应 JSON 解析失败 | `new AppError(502, 'DIFY_ERROR', 'Dify 返回数据格式异常')` | 非 JSON 响应体 |

**不自动重试**：blocking 模式下重试次数 = 0，超时后直接抛错。

---

## 2. server/utils/validators.js 扩展

### 2.1 新增函数签名

```js
/**
 * 校验 POST /api/risk/predict 请求体
 * @param {object} body   req.body
 * @returns {string|null} 错误信息字符串，校验通过返回 null
 */
function validateRiskPredict(body)
```

```js
/**
 * 校验 POST /api/plan/generate 请求体
 * @param {object} body   req.body
 * @returns {string|null} 错误信息字符串，校验通过返回 null
 */
function validatePlanGenerate(body)
```

```js
/**
 * 校验 PUT /api/plan/adjust 请求体
 * @param {object} body   req.body
 * @returns {string|null} 错误信息字符串，校验通过返回 null
 */
function validatePlanAdjust(body)
```

### 2.2 validateRiskPredict 校验规则

| 字段 | 规则 |
|------|------|
| `age` | 必填，`typeof === 'number'`，`age > 0`，`Number.isInteger(age)` |
| `gender` | 必填，string，枚举 `'male'` \| `'female'` |
| `height` | 必填，number，`height > 0` |
| `weight` | 必填，number，`weight > 0` |
| `family_history` | 必填，string，枚举 `'yes'` \| `'no'` |
| `diabetes_history` | 必填，string，枚举 `'healthy'` \| `'prediabetes'` \| `'diagnosed'` |
| `waist` | 可选，number，**若提供且为 0 → 校验失败**，非 0 才允许 |
| `systolic_bp` | 可选，number，**若提供且为 0 → 校验失败**，非 0 才允许 |
| `pregnancy` | 可选，boolean，不校验（由 risk.js 做转换） |
| `diabetes_type` | 可选，string，枚举 `'type1'` \| `'type2'` \| `'gestational'` \| `'other'` |

校验失败返回具体中文错误描述（与现有 validators.js 风格一致，返回 string）。

### 2.3 validatePlanGenerate 校验规则

| 字段 | 规则 |
|------|------|
| `health_info` | 必填，object |
| `health_info.age` | 必填，number，`> 0` |
| `health_info.gender` | 必填，string，枚举 `'male'` \| `'female'` |
| `health_info.height` | 必填，number，`> 0` |
| `health_info.weight` | 必填，number，`> 0` |
| `preferences` | 必填，object |
| `preferences.dietary` | 必填，string 非空 |
| `preferences.activity` | 必填，string 非空 |

### 2.4 validatePlanAdjust 校验规则

| 字段 | 规则 |
|------|------|
| `plan_id` | 必填，number，`> 0`，`Number.isInteger(plan_id)` |
| `feedback` | 必填，string，trim 后非空 |

### 2.5 导出

```js
module.exports = {
  ...原有导出,
  validateRiskPredict,
  validatePlanGenerate,
  validatePlanAdjust
};
```

---

## 3. server/routes/risk.js

### 3.1 模块依赖与路由前缀

```js
const { db } = require('../db/database');
const { success, AppError } = require('../utils/response');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { validateRiskPredict } = require('../utils/validators');
const { callWorkflowBlocking } = require('../services/difyService');
const authMiddleware = require('../middleware/auth');
```

路由在 `index.js` 挂载为 `router.use('/risk', riskRoutes)`。

### 3.2 POST /api/risk/predict — 详细流程

```
POST /api/risk/predict
  Middleware: authMiddleware → req.user.id 可用

Step 1: 字段校验
  const err = validateRiskPredict(req.body)
  if (err) throw new AppError(422, 'VALIDATION_ERROR', err)

Step 2: pregnancy 转换
  let pregnancy = undefined
  if (req.body.pregnancy === true)  pregnancy = 1
  if (req.body.pregnancy === false) pregnancy = 0
  // undefined → NULL (INSERT 时不传该字段)

Step 3: 构造 Dify inputs（直接透传英文值，不映射中文）
  const difyInputs = {
    age: req.body.age,
    gender: req.body.gender,
    height: req.body.height,
    weight: req.body.weight,
    family_history: req.body.family_history,
    diabetes_history: req.body.diabetes_history,
    waist: req.body.waist ?? undefined,       // 不提供则 undefined
    systolic_bp: req.body.systolic_bp ?? undefined,
    pregnancy: req.body.pregnancy,             // 原生 boolean 透传给 Dify
    diabetes_type: req.body.diabetes_type ?? undefined
  }

Step 4: 调用 Dify
  const difyResponse = await callWorkflowBlocking(
    process.env.DIFY_RISK_WORKFLOW_API_KEY,
    difyInputs
  )

Step 5: 解析 Dify 输出（三层降级）
  const outputsText = difyResponse.data.outputs.text
  let parsed
  // 第一层: JSON 优先
  try { parsed = JSON.parse(outputsText) } catch { parsed = null }
  // 第二层: 正则提取降级
  if (!parsed) parsed = parseRiskOutputRegex(outputsText)  // 内联辅助函数
  // 第三层: LLM 二次调用降级
  if (!parsed) {
    const retryResponse = await callWorkflowBlocking(
      process.env.DIFY_RISK_WORKFLOW_API_KEY,
      { ...difyInputs, __retry_parse: outputsText }
    )
    try {
      parsed = JSON.parse(retryResponse.data.outputs.text)
    } catch {
      throw new AppError(502, 'RISK_PARSE_ERROR', '风险预测成功但解析失败，请重试')
    }
  }

Step 6: 提取字段
  const {
    risk_score,
    risk_level,
    risk_level_label,
    risk_level_detail,
    diabetes_type,
    matched_diabetes_type,
    suggestions = [],
    bmi
  } = parsed

Step 7: 构造 result JSON 存储对象
  const advice = risk_level_detail
    + '\n\n### 建议：\n'
    + suggestions.map(s => '- ' + s).join('\n')
  const resultObj = {
    risk_score,
    risk_level,
    risk_level_label,
    matched_diabetes_type,
    advice
  }
  const resultJSON = JSON.stringify(resultObj)

Step 8: INSERT 到 user_risk_info
  const stmt = db.prepare(`
    INSERT INTO user_risk_info
      (user_id, age, gender, height, weight, family_history,
       waist, systolic_bp, pregnancy, diabetes_history, diabetes_type, result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const info = stmt.run(
    req.user.id,
    req.body.age, req.body.gender, req.body.height, req.body.weight,
    req.body.family_history,
    req.body.waist ?? null,
    req.body.systolic_bp ?? null,
    pregnancy ?? null,
    req.body.diabetes_history,
    diabetes_type ?? null,
    resultJSON
  )
  const recordId = info.lastInsertRowid

Step 9: 查询 created_at（better-sqlite3 同步，INSERT 后 DDL 默认值已写入）
  const record = db.prepare('SELECT created_at FROM user_risk_info WHERE id = ?').get(recordId)

Step 10: 返回
  success(res, {
    record_id: recordId,
    risk_score,
    risk_level,
    risk_level_label,
    matched_diabetes_type,
    advice,
    created_at: record.created_at
  }, '预测完成')
```

#### 3.2.1 parseRiskOutputRegex 辅助函数（内联，二层降级）

```js
function parseRiskOutputRegex(text) {
  // 尝试从非 JSON 文本中提取字段
  const extract = (pattern, text) => {
    const m = text.match(pattern);
    return m ? m[1] : undefined;
  };
  const score = extract(/risk[_ ]?score[:\s]*(\d+)/i, text);
  const level = extract(/risk[_ ]?level[:\s]*['"]?(low|medium|high)['"]?/i, text);
  // ... 依此类推
  if (!score) return null;
  return {
    risk_score: Number(score),
    risk_level: level || 'medium',
    risk_level_label: extract(/risk[_ ]?level[_ ]?label[:\s]*['"]?([^'",}\]]+)/i, text) || '',
    risk_level_detail: '',
    diabetes_type: extract(/diabetes[_ ]?type[:\s]*['"]?(type[12]|gestational|other)['"]?/i, text),
    matched_diabetes_type: extract(/matched[_ ]?diabetes[_ ]?type[:\s]*['"]?([^'",}\]]+)/i, text) || '',
    suggestions: [],
    bmi: undefined
  };
}
```

### 3.3 GET /api/risk/history — SQL 查询设计

```
GET /api/risk/history?page=1&pageSize=20
  Middleware: authMiddleware → req.user.id

Step 1: 分页参数
  const { page, pageSize, offset, limit } = parsePagination(req.query)

Step 2: 总数查询
  const { total } = db.prepare(
    'SELECT COUNT(*) AS total FROM user_risk_info WHERE user_id = ?'
  ).get(req.user.id)

Step 3: 数据查询（含 json_extract + BMI 实时计算）
  const rows = db.prepare(`
    SELECT
      id,
      CAST(json_extract(result, '$.risk_score') AS INTEGER) AS risk_score,
      json_extract(result, '$.risk_level') AS risk_level,
      json_extract(result, '$.risk_level_label') AS risk_level_label,
      json_extract(result, '$.matched_diabetes_type') AS matched_diabetes_type,
      age,
      gender,
      ROUND(weight / ((height / 100.0) * (height / 100.0)), 2) AS bmi,
      family_history,
      created_at
    FROM user_risk_info
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, limit, offset)

Step 4: 构建分页 & 返回
  const pagination = buildPagination(page, pageSize, total)
  success(res, rows, '查询成功')
```

**BMI 计算公式**：`ROUND(weight / ((height / 100.0) * (height / 100.0)), 2)` — 使用数据库列 `weight` 与 `height` 实时计算。

**字段来源标注**：

| 响应字段 | 来源 |
|---------|------|
| `risk_score` | `json_extract(result, '$.risk_score')` |
| `risk_level` | `json_extract(result, '$.risk_level')` |
| `risk_level_label` | `json_extract(result, '$.risk_level_label')` |
| `matched_diabetes_type` | `json_extract(result, '$.matched_diabetes_type')` |
| `age`, `gender`, `height`, `weight`, `family_history` | 表独立列 |
| `bmi` | 实时计算，`weight / ((height/100)^2)` |
| `created_at` | 表独立列 |

**`advice` 不在历史列表返回** — 长文本仅 `POST /api/risk/predict` 即时响应返回。

### 3.4 JSON 存储键契约（result 列）

```json
{
  "risk_score": 28,
  "risk_level": "high",
  "risk_level_label": "高风险",
  "matched_diabetes_type": "2型糖尿病",
  "advice": "根据中国2型糖尿病防治指南评分体系，您的评分为28分(>=25分)，属于高风险人群。\n\n### 建议：\n- 建议尽快就医进行口服葡萄糖耐量试验(OGTT)检查\n- …"
}
```

`diabetes_type`（英文枚举）同时写入独立列 `user_risk_info.diabetes_type`，不存入 result JSON。

---

## 4. server/utils/planParser.js

### 4.1 函数签名

```js
/**
 * 三层降级解析 Dify life-plan-generator 工作流输出
 * @param {string}         outputsText       Dify outputs.text 原始字符串
 * @param {string}         difyApiKey        用于 LLM 二次降级调用的 API Key
 * @param {function}       callWorkflowFn    二次调用函数引用 callWorkflowBlocking
 * @param {object}         originalInputs    原始 Dify inputs (health_info, preferences)，用于 LLM retry
 * @returns {object}       { items: PlanItem[], parseMethod: 'json'|'regex'|'llm_retry' }
 * @throws {AppError}      三层全部失败时抛出 AppError(502, 'PLAN_PARSE_ERROR', …)
 */
async function parsePlanOutput(outputsText, difyApiKey, callWorkflowFn, originalInputs)
```

`PlanItem` 类型（解析器返回，不含 `id`）：`{ plan_type: string, order_num: number, time_desc: string, title: string, content: string }`。响应中需要的 `id` 字段在 INSERT 后从数据库取回（见 5.3 Step 7a / 5.4 Step 7a）。

### 4.2 三层降级解析策略

#### 第一层：JSON 优先

```
1. 尝试 JSON.parse(outputsText)
2. 验证结果为数组，每项包含 plan_type / order_num / title / content
3. 成功 → 直接映射字段，parseMethod = 'json'
4. 失败 → 进入第二层
```

#### 第二层：正则提取降级

```
1. 使用正则按 plan_type/order_num/time_desc/title/content 五元组提取
2. 正则模式 (示例):
   /类型[：:]\s*(diet|exercise|other)[\s\S]*?排序[：:]\s*(\d+)[\s\S]*?时间[：:]\s*([^\n]+)[\s\S]*?标题[：:]\s*([^\n]+)[\s\S]*?内容[：:]\s*([^\n]+)/gi
   或匹配 JSON-like 片段逐条解析
3. 成功提取至少 1 条 → parseMethod = 'regex'
4. 失败 → 进入第三层
```

#### 第三层：LLM 二次调用降级（兜底）

```
1. 构造 retry inputs:
   { health_info: originalInputs.health_info,
     preferences: originalInputs.preferences,
     __retry_parse: outputsText,
     __retry_mode: true }
2. 调用 callWorkflowFn(difyApiKey, retryInputs)
3. 解析 response.data.outputs.text → JSON 数组
4. 成功 → parseMethod = 'llm_retry'
5. 失败 → throw new AppError(502, 'PLAN_PARSE_ERROR', '方案生成成功但解析失败，请重试')
```

### 4.3 导出

```js
module.exports = { parsePlanOutput };
```

---

## 5. server/routes/plan.js

### 5.1 模块依赖与路由前缀

```js
const { db } = require('../db/database');
const { success, AppError } = require('../utils/response');
const { validatePlanGenerate, validatePlanAdjust } = require('../utils/validators');
const { callWorkflowBlocking } = require('../services/difyService');
const { parsePlanOutput } = require('../utils/planParser');
const authMiddleware = require('../middleware/auth');
```

路由在 `index.js` 挂载为 `router.use('/plan', planRoutes)`。

### 5.2 内存级幂等性保护 Map

```js
// 模块级变量，存储 userId → lastRequestAt (毫秒时间戳)
const lastGenerateRequest = new Map();

function checkIdempotent(userId) {
  const lastAt = lastGenerateRequest.get(userId);
  const now = Date.now();
  if (lastAt && (now - lastAt) < 30000) {
    return false;  // 30s 内已请求
  }
  lastGenerateRequest.set(userId, now);
  return true;
}
```

### 5.3 POST /api/plan/generate — 详细流程（在 db.transaction 中执行）

```
POST /api/plan/generate
  Middleware: authMiddleware

Step 0: 幂等性检查
  if (!checkIdempotent(req.user.id))
    throw new AppError(409, 'CONFLICT', '请求过于频繁，请稍后再试')

Step 1: 字段校验
  const err = validatePlanGenerate(req.body)
  if (err) throw new AppError(422, 'VALIDATION_ERROR', err)

Step 2 - Step 4: 在 db.transaction 内执行
  const planData = db.transaction(() => {

    Step 3: 旧方案逻辑过期
      db.prepare(`
        UPDATE life_plans SET is_active = 0, updated_at = datetime('now','localtime')
        WHERE user_id = ? AND is_active = 1
      `).run(req.user.id)

    Step 4: plan_id 生成（应用层自增序列）
      const { maxId } = db.prepare(`
        SELECT COALESCE(MAX(plan_id), 0) + 1 AS maxId
        FROM life_plans WHERE user_id = ?
      `).get(req.user.id)
      const planId = maxId

    return { planId }

  })()

Step 5: 调用 Dify（事务外执行，避免长连接）
  const difyResponse = await callWorkflowBlocking(
    process.env.DIFY_PLAN_WORKFLOW_API_KEY,
    {
      health_info: req.body.health_info,
      preferences: req.body.preferences
    }
  )

Step 6: 解析 Dify 输出
  const { items, parseMethod } = await parsePlanOutput(
    difyResponse.data.outputs.text,
    process.env.DIFY_PLAN_WORKFLOW_API_KEY,
    callWorkflowBlocking,
    { health_info: req.body.health_info, preferences: req.body.preferences }
  )

Step 7: 写入新方案项（在事务内）
  db.transaction(() => {
    const insertStmt = db.prepare(`
      INSERT INTO life_plans (user_id, plan_id, plan_type, order_num, time_desc, title, content, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `)
    for (const item of items) {
      insertStmt.run(
        req.user.id,
        planData.planId,
        item.plan_type,
        item.order_num,
        item.time_desc || '',
        item.title,
        item.content
      )
    }
  })()

Step 7a: 从数据库取回刚写入的行（含自增主键 `id`）
  const planRows = db.prepare(`
    SELECT id, plan_type, order_num, time_desc, title, content
    FROM life_plans
    WHERE user_id = ? AND plan_id = ? AND is_active = 1
    ORDER BY plan_type, order_num
  `).all(req.user.id, planData.planId)

Step 8: 分组构造响应（使用 DB 取回的含 `id` 的行替代原始 `items`）
  const dietPlans = planRows.filter(r => r.plan_type === 'diet')
  const exercisePlans = planRows.filter(r => r.plan_type === 'exercise')
  const otherPlans = planRows.filter(r => r.plan_type === 'other')

  success(res, {
    plan_id: planData.planId,
    diet_plans: dietPlans,
    exercise_plans: exercisePlans,
    other_plans: otherPlans || []
  }, '方案生成成功')
```

### 5.4 PUT /api/plan/adjust — 详细流程

```
PUT /api/plan/adjust
  Middleware: authMiddleware

Step 1: 校验
  const err = validatePlanAdjust(req.body)
  if (err) throw new AppError(422, 'VALIDATION_ERROR', err)

Step 2: 逻辑过期旧方案组（按 user_id + plan_id 精确定位）
  db.prepare(`
    UPDATE life_plans SET is_active = 0, updated_at = datetime('now','localtime')
    WHERE user_id = ? AND plan_id = ?
  `).run(req.user.id, req.body.plan_id)

Step 3: 从 user_risk_info 最新记录提取 health_info
  const latest = db.prepare(`
    SELECT age, gender, height, weight
    FROM user_risk_info WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(req.user.id)
  if (!latest) throw new AppError(422, 'VALIDATION_ERROR', '请先完成风险预测或提供健康信息')

  const healthInfo = {
    age: latest.age,
    gender: latest.gender,
    height: latest.height,
    weight: latest.weight
  }

Step 4: 生成新 plan_id
  const { maxId } = db.prepare(`
    SELECT COALESCE(MAX(plan_id), 0) + 1 AS maxId
    FROM life_plans WHERE user_id = ?
  `).get(req.user.id)

Step 5: 调用 Dify（传入 feedback + health_info）
  const difyResponse = await callWorkflowBlocking(
    process.env.DIFY_PLAN_WORKFLOW_API_KEY,
    {
      health_info: healthInfo,
      preferences: {},              // adjust 不需要 preferences，传空对象
      feedback: req.body.feedback
    }
  )

Step 6: 解析 Dify 输出
  const { items } = await parsePlanOutput(
    difyResponse.data.outputs.text,
    process.env.DIFY_PLAN_WORKFLOW_API_KEY,
    callWorkflowBlocking,
    { health_info: healthInfo, preferences: {}, feedback: req.body.feedback }
  )

Step 7: 写入新方案组（事务）
  db.transaction(() => {
    const insertStmt = db.prepare(`
      INSERT INTO life_plans (user_id, plan_id, plan_type, order_num, time_desc, title, content, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `)
    for (const item of items) {
      insertStmt.run(
        req.user.id,
        maxId,
        item.plan_type,
        item.order_num,
        item.time_desc || '',
        item.title,
        item.content
      )
    }
  })()

Step 7a: 从数据库取回刚写入的行（含自增主键 `id`）
  const planRows = db.prepare(`
    SELECT id, plan_type, order_num, time_desc, title, content
    FROM life_plans
    WHERE user_id = ? AND plan_id = ? AND is_active = 1
    ORDER BY plan_type, order_num
  `).all(req.user.id, maxId)

Step 8: 返回（使用 DB 取回的含 `id` 的行替代原始 `items`）
  success(res, {
    plan_id: maxId,
    diet_plans: planRows.filter(r => r.plan_type === 'diet'),
    exercise_plans: planRows.filter(r => r.plan_type === 'exercise'),
    other_plans: planRows.filter(r => r.plan_type === 'other') || []
  }, '方案调整成功')
```

### 5.5 GET /api/plan/current — SQL 查询设计

```
GET /api/plan/current
  Middleware: authMiddleware

Step 1: 查询最新活跃方案组
  const rows = db.prepare(`
    SELECT id, plan_id, plan_type, order_num, time_desc, title, content, is_active, created_at
    FROM life_plans
    WHERE user_id = ? AND is_active = 1
      AND plan_id = (
        SELECT MAX(plan_id) FROM life_plans
        WHERE user_id = ? AND is_active = 1
      )
    ORDER BY plan_type, order_num
  `).all(req.user.id, req.user.id)

Step 2: 无方案时
  if (rows.length === 0) {
    return res.status(200).json({
      success: true,
      data: null,
      message: '尚未生成方案，请先完成风险预测或直接生成方案'
    })
  }

Step 3: 分组
  const planId = rows[0].plan_id
  const dietPlans = rows.filter(r => r.plan_type === 'diet')
  const exercisePlans = rows.filter(r => r.plan_type === 'exercise')
  const otherPlans = rows.filter(r => r.plan_type === 'other')
  const generatedAt = rows[0].created_at   // 取首条时间作为方案生成时间

  success(res, {
    plan_id: planId,
    diet_plans: dietPlans,
    exercise_plans: exercisePlans,
    other_plans: otherPlans || [],
    generated_at: generatedAt
  }, '查询成功')
```

**子查询设计说明**：`plan_id = (SELECT MAX(plan_id) ... WHERE is_active = 1)` 确保仅返回最新一套活跃方案组。同一 `user_id` 的 `is_active=1` 方案组理论上仅一套（由 generate/adjust 的"先过期后写入"逻辑保证），子查询作为防御性查询提供额外保障。

---

## 6. 统一错误响应格式

所有端点错误返回统一格式：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读的错误描述"
  }
}
```

## 7. 完整错误码映射（本批次涉及）

| HTTP 状态码 | 错误码 | 触发条件 |
|------------|--------|---------|
| 401 | `AUTH_REQUIRED` | Token 缺失/无效/过期（authMiddleware 自动处理） |
| 409 | `CONFLICT` | POST /api/plan/generate 30s 内重复请求 |
| 422 | `VALIDATION_ERROR` | 必填字段缺失 / waist=0 / systolic_bp=0 / 字段类型错误 / adjust 缺少 plan_id 或 feedback |
| 429 | `RATE_LIMITED` | Dify 返回 429（透传） |
| 502 | `DIFY_ERROR` | Dify 返回 401/404/500+ / 网络连接失败 / 响应格式异常 |
| 502 | `RISK_PARSE_ERROR` | 风险预测 Dify 输出三层解析全部失败 |
| 502 | `PLAN_PARSE_ERROR` | 方案生成 Dify 输出三层解析全部失败 |
| 504 | `AI_TIMEOUT` | Dify 请求超过 15 秒未响应 |
| 500 | `INTERNAL_ERROR` | 未捕获异常（errorHandler 中间件兜底） |

---

## 8. server/routes/index.js 修改

在已注释的路由挂载区域取消注释并启用：

```js
// 在现有挂载末尾新增（后续批次将在此挂载以下路由模块 注释区域之后）
router.use('/risk', require('./risk'));
router.use('/plan', require('./plan'));
```

完整挂载顺序：
```
auth → user → doctors → articles → diabetes-types → risk → plan
```

---

## 9. 实现顺序

```
Task1 (difyService.js) → Task5 (validators.js) → Task4 (planParser.js)
  → Task2 (risk.js) → Task3 (plan.js) → Task6 (index.js)
```
