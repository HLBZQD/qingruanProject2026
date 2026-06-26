# code_review_v1_r1.md — 风险预测与生活方案 Batch4 Code Review

## 结论: REJECTED

整体实现质量高，但存在 1 个功能性缺陷必须修复。

---

## 检查清单

| # | 检查项 | 结果 | 说明 |
|---|--------|------|------|
| 1 | pregnancy 转换 | PASS | `risk.js:36-38` 正确转换 boolean → 1/0/undefined→NULL |
| 2 | plan_id 生成 | PASS | `plan.js:38-41` 及 `165-168` 使用 `COALESCE(MAX(...),0)+1` 用户级自增 |
| 3 | 旧方案过期 | PASS | generate 过期所有 `is_active=1`；adjust 按 `plan_id` 精确过期 |
| 4 | INSERT 后 ID 取回 | PASS | `risk.js:122-124` 及 `plan.js:80-85,204-209` 正确取回含自增主键的行 |
| 5 | Dify 调用签名 | PASS | `difyService.js:84-109` — POST /workflows/run, Bearer token, blocking, 15s timeout |
| 6 | Mock 兜底 | PASS | `difyService.js:87-93` — `!DIFY_API_BASE_URL` 时返回完整 Mock 数据 |
| 7 | planParser 三层降级 | PASS | `planParser.js` — JSON → 正则 → LLM retry 三层完整 |
| 8 | SQL 参数化 | PASS | 所有查询使用 `?` 占位符 + 参数绑定 |
| 9 | JSON extract for history | PASS | `risk.js:148-164` 正确使用 `json_extract(result, '$.xxx')` + BMI 实时计算 |
| 10 | 错误处理 | **FAIL** | 见下方缺陷详情 |

---

## 缺陷详情

### DEFECT-1: GET /api/risk/history 分页信息未返回

**严重程度**: 功能缺陷 (Medium)

**位置**: `server/routes/risk.js:166-167`

**当前代码**:
```js
const pagination = buildPagination(page, pageSize, total);
success(res, rows, '查询成功');
```

**问题**: `buildPagination()` 返回的 `{ page, pageSize, total, totalPages }` 对象被计算但从未包含在响应中。`success()` helper 仅输出 `{ success, message, data }`，无 `pagination` 字段。

**现有约定**: 本项目中所有分页端点 (`/doctors`, `/articles`, `/articles/collections`) 均将 `pagination` 显式放入响应对象，不使用 `success()` 快捷方式：
```js
// doctors.js:13 — 正确模式
res.status(200).json({ success: true, message: '查询成功', data: rows, pagination });
```

**修复方案**:
```js
// risk.js:166-167 改为:
const pagination = buildPagination(page, pageSize, total);
res.status(200).json({ success: true, message: '查询成功', data: rows, pagination });
```

**影响**: 前端/客户端无法获知总页数、总条数等分页元信息，无法正确渲染分页控件。

---

## 建议改进（非阻塞）

| # | 类别 | 位置 | 说明 |
|---|------|------|------|
| S1 | 风格一致性 | `difyService.js:3` / `planParser.js:1` | `AppError` 从 `../middleware/errorHandler` 导入，而 `risk.js` / `plan.js` 从 `../utils/response` 导入。虽然两者等价（response.js 从 errorHandler 转导出），但建议统一使用 `../utils/response` 以保持一致性。 |
| S2 | 注释清理 | `server/routes/index.js:17-31` | 已注释的路由代码块内容仍保留 `riskRoutes` / `planRoutes` 等占位注释。由于 `/risk` 和 `/plan` 已正式挂载，建议清理过时的注释块以避免混淆。 |

---

## 总结

- **10 项检查**: 9 PASS, 1 FAIL
- **阻塞项**: DEFECT-1 (分页信息未返回) — 必须修复后重新审查
- **建议项**: S1, S2 可后续迭代处理
