# design_review_v1_r1.md — batch4 风险预测与生活方案 detail_v1.md 审查报告

**结论: REJECTED**

---

## 审查范围

- `detail_v1.md` (815 lines)
- `requirement.md` (batch4, 60 lines)
- `2_detailed_design_v3.md` 第 3.2.7-3.2.15 节 + 第 5.2.1-5.2.2 节 + 第 5.2.1.1 节

---

## 逐项检查结果

### 1. API 请求/响应正确性

| 端点 | 请求体 | 响应体 | 状态 |
|------|--------|--------|------|
| POST /api/risk/predict | 字段、类型、枚举值、pregnancy 为 boolean — 完全匹配 3.2.7 | response 字段 record_id/risk_score/risk_level/risk_level_label/matched_diabetes_type/advice/created_at — 匹配 | PASS |
| GET /api/risk/history | 分页查询参数 — 匹配 | 字段 id/risk_score/risk_level/risk_level_label/matched_diabetes_type/age/gender/bmi/family_history/created_at + pagination — 匹配 | PASS |
| POST /api/plan/generate | health_info + preferences — 匹配 3.2.13 | **`id` 字段缺失** (见下方 P0 缺陷) | **FAIL** |
| PUT /api/plan/adjust | plan_id + feedback — 匹配 3.2.14 | **`id` 字段缺失** (同 generate) | **FAIL** |
| GET /api/plan/current | 无请求体 — 匹配 | plan_id/diet_plans/exercise_plans/other_plans/generated_at + 空值兜底 data=null — 匹配 | PASS |

#### P0 缺陷: 方案项响应缺失 `id` 字段

**设计契约要求** (2_detailed_design_v3.md 3.8.3 节, line 2686-2693):
```typescript
interface LifePlan {
  id: number;
  plan_type: 'diet' | 'exercise' | 'other';
  order_num: number;
  time_desc: string;
  title: string;
  content: string;
}
```

设计文档 3.2.13 节 `POST /api/plan/generate` 响应示例明确包含 `"id": 1` / `"id": 5`。

**detail_v1.md 现状**: `POST /api/plan/generate` (5.3 节 Step 8) 与 `PUT /api/plan/adjust` (5.4 节 Step 8) 的返回数据直接取自 `parsePlanOutput()` 的 `items` (类型 `PlanItem[] = { plan_type, order_num, time_desc, title, content }` — 无 `id`)。INSERT 后未查询 `life_plans` 表取回自增主键 `id`。

**注意**: `GET /api/plan/current` (5.5 节) 正确返回 `id` (因为 SQL SELECT 直接包含该列)，仅有 POST/PUT 两个写端点缺失。

**修复建议**: 在 INSERT 事务后查询刚写入的行:
```sql
SELECT id, plan_type, order_num, time_desc, title, content
FROM life_plans WHERE user_id = ? AND plan_id = ? AND is_active = 1
ORDER BY plan_type, order_num
```
用查询结果替换 `items` 构造响应。

---

### 2. Pregnancy boolean→INTEGER 转换

| 环节 | 设计要求 (5.2.1.1 节) | detail_v1.md 实现 | 状态 |
|------|----------------------|-------------------|------|
| 写入 DB | `true→1`, `false→0`, `undefined→NULL` | `if (true) pregnancy=1; if (false) pregnancy=0; undefined→null` (3.2 Step 2 + Step 8 `pregnancy ?? null`) | PASS |
| Dify 输入 | 透传原始 boolean | `pregnancy: req.body.pregnancy` (3.2 Step 3) | PASS |
| 历史读回 | INTEGER 直接透传 | 历史列表不返回 pregnancy 字段 (3.3 节) — 一致 | PASS |
| DDL CHECK | `INTEGER CHECK(pregnancy IN (0,1) OR NULL)` | INSERT 值 1/0/NULL 满足约束 | PASS |

---

### 3. JSON extract 用于历史记录查询

| 字段 | 设计 SQL (3.2.8) | detail_v1.md SQL (3.3) | 状态 |
|------|-----------------|----------------------|------|
| risk_score | `CAST(json_extract(result, '$.risk_score') AS INTEGER)` | 完全一致 | PASS |
| risk_level | `json_extract(result, '$.risk_level')` | 完全一致 | PASS |
| risk_level_label | `json_extract(result, '$.risk_level_label')` | 完全一致 | PASS |
| matched_diabetes_type | `json_extract(result, '$.matched_diabetes_type')` | 完全一致 | PASS |
| BMI 实时计算 | `ROUND(weight / ((height / 100.0) * (height / 100.0)), 2)` | 完全一致 | PASS |

字段来源标注表 (3.3 节) 与设计 3.2.8 注释一致。`advice` 不在历史列表返回 — 一致。

---

### 4. plan_id 生成逻辑

| 端点 | 设计要求 (3.2.13/3.2.14) | detail_v1.md | 状态 |
|------|------------------------|-------------|------|
| POST /api/plan/generate | `SELECT COALESCE(MAX(plan_id), 0) + 1 FROM life_plans WHERE user_id=?` (应用层自增, 按 user_id 作用域) | 完全一致 (5.3 Step 4) | PASS |
| PUT /api/plan/adjust | 同上策略, 生成新 plan_id | 完全一致 (5.4 Step 4) | PASS |

`plan_id` 作用域正确限定在 `user_id` 范围内。生成时机在 Dify 调用之前 (事务内预取), 符合「先过期→再生成ID→调用 Dify→写入」的顺序。

---

### 5. 旧方案过期逻辑

| 端点 | 设计要求 | detail_v1.md | 状态 |
|------|---------|-------------|------|
| POST /api/plan/generate | `UPDATE life_plans SET is_active=0, updated_at=datetime('now','localtime') WHERE user_id=? AND is_active=1` (全局过期) | 完全一致 (5.3 Step 3) | PASS |
| PUT /api/plan/adjust | `UPDATE ... WHERE user_id=? AND plan_id=?` (精确定位) | 完全一致 (5.4 Step 2) | PASS |

过期的 `updated_at` 使用 `datetime('now','localtime')` — 与设计一致。

---

### 6. Mock 数据完整性

| Mock | 要求 | 实现 | 状态 |
|------|------|------|------|
| 风险预测 Mock | Dify `response.data` 完整结构 + `outputs.text` 内嵌 JSON 含所有必填字段 | 1.4.1 节: 完整 Dify 外层 + 内层 JSON 含 risk_score/risk_level/risk_level_label/risk_level_detail/diabetes_type/matched_diabetes_type/suggestions(3条)/bmi | PASS |
| 方案生成 Mock | Dify 外层 + `outputs.text` 内嵌 JSON 数组 (diet×4 + exercise×3) | 1.4.2 节: 完整 Dify 外层 + 内层数组 7 项 (diet×4 + exercise×3), 每项含 plan_type/order_num/time_desc/title/content | PASS |

Mock 数据结构与 5.2.1/5.2.2 节 Dify 工作流输出定义一致。Mock 触发条件 (`!DIFY_API_BASE_URL`) 与 `callWorkflowBlocking` 设计合理。

---

## 通过项汇总 (6 项中 5 项通过)

| 检查项 | 结果 |
|--------|------|
| 1. API 请求/响应 | **FAIL** — plan 响应缺 `id` |
| 2. pregnancy 转换 | PASS |
| 3. JSON extract | PASS |
| 4. plan_id 生成 | PASS |
| 5. 旧方案过期 | PASS |
| 6. Mock 数据 | PASS |

---

## 修复要求

**唯一阻塞项**: `POST /api/plan/generate` 和 `PUT /api/plan/adjust` 的响应中, 每个方案项 (diet_plans/exercise_plans/other_plans 数组元素) 必须包含 `id` 字段 (类型 `number`, 对应 `life_plans.id` 自增主键)。

修复后重新提交为 `detail_v2.md`, 本轮其他内容无需变更。
