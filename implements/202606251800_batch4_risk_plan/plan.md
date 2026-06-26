# 批次 4 实现计划：风险预测与生活方案核心闭环

## 整体任务分解 (6 tasks, 顺序执行)

### Task 1: difyService.js (difyService 封装)
**文件**: `server/services/difyService.js`

- 实现 `callWorkflowBlocking(apiKey, inputs)`:
  - POST `{DIFY_API_BASE_URL}/workflows/run`, `response_mode: 'blocking'`, `user: 'api-user'`
  - 超时控制: 连接超时 15s, 读取超时 15s (使用 axios + AbortSignal.timeout 或 http agent)
  - Dify 非200错误: 按 6.3.5 节映射表转换 → 抛出 AppError
  - **Mock 兜底**: 当 DIFY_API_BASE_URL 未配置或网络不可达时, 返回结构正确的硬编码 Mock 数据
    - 风险 Mock: `{ risk_score, risk_level, risk_level_label, risk_level_detail, diabetes_type, matched_diabetes_type, suggestions, bmi }`
    - 方案 Mock: `{ plans: [{ plan_type, order_num, time_desc, title, content }...] }`
  - 返回 `{ data: { outputs: { text: string } } }` 结构
- 不自动重试 (需求 7.3 节)
- API Key 由调用方传入, 不在 difyService 内部硬编码

### Task 2: risk.js 路由 (风险预测)
**文件**: `server/routes/risk.js`

- **POST /api/risk/predict** (3.2.7 节):
  - JWT 鉴权 (authMiddleware)
  - 校验必填字段: age, gender, height, weight, family_history, diabetes_history — 枚举值英文小写
  - 校验 waist/systolic_bp 不为 0 (若提供)
  - pregnancy: boolean → INTEGER 转换 (true→1, false→0, undefined→NULL)
  - 调用 difyService.callWorkflowBlocking(DIFY_RISK_WORKFLOW_API_KEY, inputs)
  - 解析 Dify 输出 (JSON 优先 → 正则提取降级, 按 5.2.1.1 节契约)
  - 构造 result JSON → JSON.stringify 写入 user_risk_info.result 列
  - diabetes_type 同时写入 user_risk_info.diabetes_type 独立列
  - INSERT 到 user_risk_info 表
  - 返回: `{ record_id, risk_score, risk_level, risk_level_label, matched_diabetes_type, advice, created_at }`
  - advice = risk_level_detail + "\n\n### 建议：\n" + suggestions.map(s => '- ' + s).join('\n')

- **GET /api/risk/history** (3.2.8 节):
  - JWT 鉴权
  - 分页: parsePagination(req.query)
  - SQL: json_extract(result, '$.risk_score'), json_extract(result, '$.risk_level'), ..., BMI 实时计算
  - 返回: `{ data: [...], pagination: { page, pageSize, total, totalPages } }`

### Task 3: plan.js 路由 (生活方案)
**文件**: `server/routes/plan.js`

- **POST /api/plan/generate** (3.2.13 节):
  - JWT 鉴权
  - 幂等性检查: 内存 Map<userId, lastRequestAt>, 30s 内拒绝重复 (409 CONFLICT)
  - 校验 health_info, preferences 字段
  - 旧方案逻辑过期: `UPDATE life_plans SET is_active=0 WHERE user_id=? AND is_active=1`
  - plan_id 生成: `SELECT COALESCE(MAX(plan_id), 0) + 1 FROM life_plans WHERE user_id=?`
  - 调用 difyService.callWorkflowBlocking(DIFY_PLAN_WORKFLOW_API_KEY, inputs)
  - 解析 Dify 输出 (JSON 优先 → 正则提取降级 → LLM 二次降级, 见 planParser)
  - 逐条 INSERT 到 life_plans: (user_id, plan_id, plan_type, order_num, time_desc, title, content, is_active=1)
  - 以上操作在 db.transaction 中执行
  - 返回: `{ plan_id, diet_plans: [...], exercise_plans: [...], other_plans: [] }`

- **GET /api/plan/current** (3.2.15 节):
  - JWT 鉴权
  - SQL: 最新活跃方案组 (子查询 MAX(plan_id) WHERE is_active=1), 按 plan_type, order_num 排序
  - 无方案: `{ data: null, message: "尚未生成方案..." }`
  - 有方案: 按 diet_plans / exercise_plans / other_plans 分组返回

- **PUT /api/plan/adjust** (3.2.14 节):
  - JWT 鉴权
  - 校验 plan_id, feedback
  - 逻辑过期旧方案组: `UPDATE life_plans SET is_active=0 WHERE user_id=? AND plan_id=?`
  - 从旧方案组提取 health_info (查 user_risk_info 最新记录)
  - 调用 Dify 重新生成 (传入 feedback + health_info)
  - 新 plan_id, 写入, 返回 — 同 generate 响应结构
  - 在 db.transaction 中执行

### Task 4: planParser.js (方案解析器)
**文件**: `server/utils/planParser.js`

- 实现三层降级解析 (5.2.2 节):
  1. **JSON 优先**: `JSON.parse(outputs.text)` → 验证数组结构 → 直接映射字段
  2. **正则提取降级**: 按 plan_type/order_num/time_desc/title/content 五元组正则提取
  3. **LLM 二次调用降级** (兜底): 将原始文本作为 query 再次调用 Dify, 要求返回严格 JSON
- 输出: `{ items: [{ plan_type, order_num, time_desc, title, content }], parseMethod: 'json'|'regex'|'llm_retry' }`
- 解析失败抛出: `new AppError(502, 'PLAN_PARSE_ERROR', '方案生成成功但解析失败，请重试')`

### Task 5: validators.js 扩展
**文件**: `server/utils/validators.js` (扩展)

- 新增 `validateRiskPredict(body)`:
  - 必填: age(number>0), gender(enum male/female), height(number>0), weight(number>0), family_history(enum yes/no), diabetes_history(enum healthy/prediabetes/diagnosed)
  - 可选: waist(number!=0), systolic_bp(number!=0), pregnancy(boolean), diabetes_type(enum type1/type2/gestational/other)
  - 返回 null 或错误信息字符串

- 新增 `validatePlanGenerate(body)`:
  - 必填: health_info{ age, gender, height, weight }, preferences{ dietary, activity }
  - 返回 null 或错误信息字符串

- 新增 `validatePlanAdjust(body)`:
  - 必填: plan_id(number>0), feedback(string非空)
  - 返回 null 或错误信息字符串

### Task 6: index.js 挂载路由
**文件**: `server/routes/index.js` (修改)

- 启用已注释的 risk/plan 路由挂载:
  ```js
  const riskRoutes = require('./risk');
  const planRoutes = require('./plan');
  router.use('/risk', riskRoutes);
  router.use('/plan', planRoutes);
  ```

---

## 依赖关系

```
Task1 (difyService)
  ├── Task2 (risk路由) ── 依赖 Task1, Task5
  ├── Task3 (plan路由) ── 依赖 Task1, Task4, Task5
  │     └── Task4 (planParser)
  └── Task5 (validators扩展)
        └── Task6 (index.js挂载) ── 依赖 Task2, Task3
```

推荐执行顺序: **Task1 → Task5 → Task4 → Task2 → Task3 → Task6**

## 设计文档覆盖确认

| 设计节 | 内容 | 对应文件 |
|--------|------|---------|
| 3.2.7 | POST /api/risk/predict | risk.js |
| 3.2.8 | GET /api/risk/history | risk.js |
| 3.2.13 | POST /api/plan/generate | plan.js + planParser.js |
| 3.2.14 | PUT /api/plan/adjust | plan.js |
| 3.2.15 | GET /api/plan/current | plan.js |
| 5.2.1 | diabetes-risk-prediction 工作流 | difyService.js + risk.js |
| 5.2.2 | life-plan-generator 工作流 | difyService.js + plan.js + planParser.js |
| 5.2.1.1 | 风险预测端到端字段映射契约 | risk.js |
| 6.3.5 | difyService 行为规格 | difyService.js |
| 6.3.5 | Dify 错误码映射表 | difyService.js |
| 6.3.5 | 工作流输出解析框架 | risk.js + planParser.js |

## 验收标准

1. `POST /api/risk/predict` — 提交健康数据, 返回 risk_score/risk_level/risk_level_label/matched_diabetes_type/advice/created_at
2. `GET /api/risk/history` — 分页返回当前用户历史记录, 含 BMI 计算
3. `POST /api/plan/generate` — 生成方案, 返回 diet_plans(4)/exercise_plans(3)/other_plans, 旧方案 is_active=0
4. `GET /api/plan/current` — 返回最新活跃方案组, 无方案返回 null
5. `PUT /api/plan/adjust` — 基于 feedback 调整方案, 返回新方案
6. Dify 不可用时, Mock 兜底返回结构正确的数据
7. planParser 三层降级: JSON → 正则 → LLM retry
8. 所有端点 JWT 鉴权, 错误码符合 3.4 节定义
