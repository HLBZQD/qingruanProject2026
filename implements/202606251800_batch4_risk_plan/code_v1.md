# code_v1.md — 风险预测与生活方案 Batch4 实现总结

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/services/difyService.js` | 新建 | `callWorkflowBlocking` + Mock 兜底 |
| `server/utils/planParser.js` | 新建 | 三层降级解析（JSON → 正则 → LLM 重试） |
| `server/utils/validators.js` | 扩展 | 新增 `validateRiskPredict` / `validatePlanGenerate` / `validatePlanAdjust` |
| `server/routes/risk.js` | 新建 | `POST /predict` + `GET /history` |
| `server/routes/plan.js` | 新建 | `POST /generate` + `GET /current` + `PUT /adjust` |
| `server/routes/index.js` | 更新 | 挂载 `/risk` 和 `/plan` |

## 关键实现细节

### difyService.js
- 使用 Node.js 内置 `http`/`https` 模块
- 15s 超时（连接+读取）
- `!process.env.DIFY_API_BASE_URL` 时返回 Mock 数据
- 错误码按映射表抛出 AppError（400→422, 401/404/500+→502, 429→429, 超时→504）
- 不自动重试

### validators.js 扩展
- `validateRiskPredict`: age/height/weight > 0 整数，gender 枚举，family_history 枚举，diabetes_history 枚举，waist/systolic_bp 若提供则 > 0，diabetes_type 可选枚举
- `validatePlanGenerate`: health_info.age/height/weight > 0，preferences.dietary/activity 非空
- `validatePlanAdjust`: plan_id > 0 整数，feedback 非空

### planParser.js 三层降级
1. JSON.parse → 验证数组 + 每项含 plan_type/title/content
2. 正则：JSON 片段匹配 + 中文标签模式匹配
3. LLM 二次调用（传入 `__retry_parse` + `__retry_mode`）

### risk.js
- POST /predict: 校验 → pregnancy `? 1 : 0` → Dify inputs 透传 → bloom 输出解析（三层） → INSERT → 取 created_at → 返回
- GET /history: 分页 + json_extract result 列 + BMI 实时计算
- 结果存储为 result JSON 列，advice 不在列表返回

### plan.js
- POST /generate: 30s 幂等性保护 → 事务内：旧方案过期 + plan_id 自增 → Dify 调用 → planParser 解析 → 事务内批量 INSERT → 取回含 id 的行 → 分组返回
- GET /current: 子查询取最新 is_active=1 的 plan_id → 无方案返回 `data: null`
- PUT /adjust: 旧方案按 plan_id 过期 → 从 user_risk_info 取最新 health_info → 新 plan_id → Dify(feedback) → planParser → INSERT → 取回含 id

### 数据库契约
- **pregnancy**: 写入 `req.body.pregnancy ? 1 : 0`, NULL 表示未提供
- **plan_id**: `SELECT COALESCE(MAX(plan_id), 0) + 1 FROM life_plans WHERE user_id=?`
- **旧方案过期**: `UPDATE life_plans SET is_active=0 WHERE user_id=? AND is_active=1`
- **INSERT 后取 id**: `SELECT id, plan_type, order_num, time_desc, title, content FROM life_plans WHERE user_id=? AND plan_id=? AND is_active=1`
- 所有 SQL 使用参数化查询（`?` 占位符）
