# Plan Review v1 r1: 批次 4 实现计划审查

## 审查范围
- `plan.md` — 任务分解
- `task_v1.md` — 第一个任务规格

## 审查维度

### 1. 5 个 API 端点覆盖 (requirement.md §实现内容)

| 端点 | 需求 | plan.md 覆盖 | 状态 |
|------|------|-------------|------|
| POST /api/risk/predict | 校验/枚举/0值/pregnancy转换/Dify调用/写入/返回 | Task 2 (risk.js) | ✅ |
| GET /api/risk/history | 分页/BMI计算/json_extract | Task 2 (risk.js) | ✅ |
| POST /api/plan/generate | plan_id生成/旧方案过期/Dify调用/解析/写入/返回 | Task 3 (plan.js) + Task 4 | ✅ |
| GET /api/plan/current | 最新活跃方案/分组排序/null兜底 | Task 3 (plan.js) | ✅ |
| PUT /api/plan/adjust | plan_id过期/重新生成/返回 | Task 3 (plan.js) | ✅ |

**结论**: 全部 5 个端点均在 plan.md 中有明确任务对应。

### 2. Dify 封装覆盖

| 需求项 | 来源 | plan.md 覆盖 | 状态 |
|--------|------|-------------|------|
| callWorkflowBlocking(apiKey, inputs) | requirement §Dify Blocking | Task 1 | ✅ |
| 超时控制 15s | 6.3.5 节 | Task 1 + task_v1 | ✅ |
| Dify 非200错误处理 + 错误码映射 | 6.3.5 节映射表 | Task 1 + task_v1 | ✅ |
| Mock 兜底 | requirement §Mock | Task 1 + task_v1 | ✅ |
| 不自动重试 | 需求 7.3 节 | Task 1 + task_v1 | ✅ |
| API Key 由调用方传入 | 6.3.5 节 | Task 1 + task_v1 | ✅ |

**结论**: Dify 封装全部覆盖。

### 3. planParser 覆盖

| 需求项 | plan.md 覆盖 | 状态 |
|--------|-------------|------|
| 三层降级: JSON 优先 | Task 4 | ✅ |
| 三层降级: 正则提取降级 (五元组) | Task 4 | ✅ |
| 三层降级: LLM 二次调用降级 | Task 4 | ✅ |
| PLAN_PARSE_ERROR 错误响应 | Task 4 | ✅ |

**结论**: planParser 三层降级完整覆盖。

### 4. validators 扩展覆盖

| 校验项 | plan.md 覆盖 | 状态 |
|--------|-------------|------|
| validateRiskPredict (枚举/0值/必填) | Task 5 | ✅ |
| validatePlanGenerate (health_info/preferences) | Task 5 | ✅ |
| validatePlanAdjust (plan_id/feedback) | Task 5 | ✅ |

**结论**: validators 扩展覆盖所有端点输入校验。

### 5. index.js 挂载覆盖

| 挂载项 | plan.md 覆盖 | 状态 |
|--------|-------------|------|
| router.use('/risk', riskRoutes) | Task 6 | ✅ |
| router.use('/plan', planRoutes) | Task 6 | ✅ |

**结论**: 路由挂载完整。

### 6. 依赖关系合理性

```
Task1(difyService) → Task2(risk) + Task3(plan) + Task4(planParser)
Task5(validators)  → Task2(risk) + Task3(plan)
Task2 + Task3      → Task6(index.js挂载)
```

- Task 1 (difyService) 是独立模块, 无上游依赖, 作为第一个任务合理
- Task 5 (validators) 仅依赖已有 utils/response.js, 可尽早完成
- Task 4 (planParser) 仅依赖 Task 1 (LLM 二次降级需要 difyService), 逻辑上属 plan.js 子模块
- 推荐执行顺序 Task1 → Task5 → Task4 → Task2 → Task3 → Task6 合理

### 7. 设计文档参考完整性

plan.md 底部的"设计文档覆盖确认"表已列出所有相关设计节 (3.2.7, 3.2.8, 3.2.13, 3.2.14, 3.2.15, 5.2.1, 5.2.2, 5.2.1.1, 6.3.5) 与对应文件映射, 完整性良好。

### 8. 边界场景覆盖检查

| 场景 | 覆盖 |
|------|------|
| waist/systolic_bp 为 0 → 422 VALIDATION_ERROR | Task 5 (validateRiskPredict) |
| pregnancy boolean→INTEGER 转换 | Task 2 (risk.js POST predict) |
| Dify 不可用 Mock 兜底 | Task 1 (difyService) |
| plan/generate 30s 幂等性 | Task 3 (plan.js) |
| plan/current 无方案返回 null | Task 3 (plan.js GET current) |
| planParser 三层全部失败返回错误 | Task 4 (planParser) |
| 所有操作在 db.transaction 中 | Task 3 (plan.js) |

**结论**: 关键边界场景均有覆盖。

---

## 审查结论

**APPROVED**

plan.md 任务分解完整覆盖 requirement.md 所有 5 个 API 端点 + DifyService + Mock 兜底 + planParser, task_v1.md 规格清晰可执行。推荐执行顺序合理, 依赖关系正确, 无遗漏项。
