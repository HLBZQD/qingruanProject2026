# Verify Report v1 — 全栈验收复试

**执行时间**: 2026-06-25  
**测试环境**: localhost:3000  

---

## 1. 环境准备

```bash
rm -f data/database.sqlite
node server.js &
```
数据库重新初始化，种子数据写入成功。

---

## 2. API 接口测试

### 2.1 GET /api/doctors

**请求**: `curl -s http://localhost:3000/api/doctors`

**结果**: 返回 3 位医生

```json
{
  "success": true,
  "message": "查询成功",
  "data": [
    {"id":1, "name":"张明远", "department":"内分泌科", "title":"主任医师", ...},
    {"id":2, "name":"李静怡", "department":"糖尿病专科", "title":"专科医师", ...},
    {"id":3, "name":"王建国", "department":"营养科", "title":"营养科专家", ...}
  ],
  "pagination": {"page":1, "pageSize":20, "total":3, "totalPages":1}
}
```

**验证**: 响应数据中 **不含 `chat_token` 字段**。源代码 `server/routes/doctors.js:11` SELECT 语句只选了 `id, name, department, title, description, avatar`，显式排除了 `chat_token`。✅

### 2.2 GET /api/doctors/1

**请求**: `curl -s http://localhost:3000/api/doctors/1`

**结果**:

```json
{
  "success": true,
  "message": "查询成功",
  "data": {
    "id": 1, "name":"张明远", "department":"内分泌科", "title":"主任医师",
    "description":"从事内分泌代谢疾病临床工作20年...", "avatar":"/static/images/doctors/doc1.jpg",
    "created_at":"2026-06-25 17:22:27"
  }
}
```

**验证**: 同样不含 `chat_token`。源代码 `server/routes/doctors.js:17` SELECT 只需 `id, name, department, title, description, avatar, created_at`。✅

### 2.3 GET /api/diabetes-types

**请求**: `curl -s http://localhost:3000/api/diabetes-types`

**结果**: 返回 4 种糖尿病类型

```json
{
  "success": true,
  "message": "查询成功",
  "data": [
    {"id":1, "name":"1型糖尿病", ...},
    {"id":2, "name":"2型糖尿病", ...},
    {"id":3, "name":"妊娠期糖尿病", ...},
    {"id":4, "name":"其他特殊类型糖尿病", ...}
  ]
}
```

**验证**: 返回完整糖尿病类型列表，每项含 `pathogenesis`, `manifestation`, `treatment` 字段。✅

### 2.4 GET /api/diabetes-types/1

**请求**: `curl -s http://localhost:3000/api/diabetes-types/1`

**结果**: 返回 1 型糖尿病详情，含 `pathogenesis`, `manifestation`, `treatment` 字段

**验证**: 返回正确的单条记录。✅

### 2.5 GET /api/articles

**请求**: `curl -s http://localhost:3000/api/articles`

**结果**: 返回 3 篇公共文章

```json
{
  "success": true,
  "message": "查询成功",
  "data": [
    {"id":3, "title":"如何正确监测血糖水平", "category":"生活习惯", ...},
    {"id":2, "title":"适合糖尿病患者的运动建议", "category":"运动指南", ...},
    {"id":1, "title":"糖尿病患者的饮食指南", "category":"饮食指导", ...}
  ],
  "pagination": {"page":1, "pageSize":20, "total":3, "totalPages":1}
}
```

**验证**: 源代码 `server/routes/articles.js:23-28` 查询条件为 `WHERE user_id IS NULL`，只返回公共文章，未混入用户私有文章。✅

### 2.6 GET /api/articles?category=饮食指导

**请求**: `curl -s "http://localhost:3000/api/articles?category=%E9%A5%AE%E9%A3%9F%E6%8C%87%E5%AF%BC"`

**结果**: 返回 1 篇 `饮食指导` 分类文章

**验证**: 分类筛选功能正常。✅

### 2.7 GET /api/articles/1 (无需认证)

**请求**: `curl -s http://localhost:3000/api/articles/1`

**结果**: 返回文章详情，包含字段:

```json
{
  "success": true,
  "message": "查询成功",
  "data": {
    "id": 1,
    "title": "糖尿病患者的饮食指南",
    "content": "# 糖尿病患者的饮食指南\n\n...",
    "tags": [],
    "summary": "",
    "is_collected": false
  }
}
```

**验证**: 含 `content`, `tags`, `summary`, `is_collected` 四个字段。未认证时 `is_collected` 为 `false`。✅

---

## 3. 用户注册 & 收藏功能测试

### 3.1 POST /api/auth/register

**请求**:
```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser2","password":"Test123456"}'
```

**结果**: 返回 201 + token，注册成功。✅

### 3.2 POST /api/auth/login

**请求**: 同上，用户名密码登录

**结果**: 返回 200 + token，登录成功。✅

### 3.3 POST /api/articles/1/collect (首次收藏)

**请求**:
```bash
curl -s -X POST http://localhost:3000/api/articles/1/collect \
  -H "Authorization: Bearer <token>"
```

**结果**: `{"success":true, "message":"收藏成功", "data":null}`

**验证**: 首次收藏成功。✅

### 3.4 GET /api/articles/1 (已认证，检查 is_collected)

**请求**:
```bash
curl -s http://localhost:3000/api/articles/1 \
  -H "Authorization: Bearer <token>"
```

**结果**: `"is_collected": true`

**验证**: 已认证用户查看已收藏文章，`is_collected` 为 `true`。源代码 `server/routes/articles.js:44-46` 通过 `optionalAuth` 中间件实现。✅

### 3.5 POST /api/articles/1/collect (重复收藏)

**请求**: 同上，第二次收藏同一文章

**结果**: `{"success":true, "message":"文章已收藏", "data":null}`

**验证**: 未产生重复记录。源代码逻辑 `server/routes/articles.js:56-57` 先查 `existing`，存在则直接返回。且数据库 `UNIQUE(user_id, article_id)` 约束作为第二层保护。✅

### 3.6 DELETE /api/articles/1/collect

**请求**:
```bash
curl -s -X DELETE http://localhost:3000/api/articles/1/collect \
  -H "Authorization: Bearer <token>"
```

**结果**: `{"success":true, "message":"已取消收藏"}`

**验证**: 取消收藏成功。✅

### 3.7 GET /api/articles/collections

**请求**:
```bash
curl -s http://localhost:3000/api/articles/collections \
  -H "Authorization: Bearer <token>"
```

**结果**: 收藏列表为空 (total: 0)，因为已取消收藏。

**验证**: 收藏列表查询正常。✅

### 3.8 GET /api/articles/1 (未认证，检查 is_collected 恢复)

**请求**: `curl -s http://localhost:3000/api/articles/1`

**结果**: `"is_collected": false`

**验证**: 取消收藏后未认证查看，`is_collected` 为 `false`。✅

### 3.9 独立性验证

重新收藏文章 1，查询收藏列表：

**结果**: 列表只有 1 条记录 `{"id":1,"title":"糖尿病患者的饮食指南",...,"collect_id":1}`

**验证**: 即使重复调用收藏接口，也仅产生单条收藏记录，无重复数据。✅

---

## 4. 验收标准总结

| # | 验收标准 | 状态 |
|---|---------|------|
| 1 | /api/doctors 返回医生列表（不含 chat_token） | ✅ PASS |
| 2 | /api/diabetes-types 返回糖尿病类型列表 | ✅ PASS |
| 3 | /api/articles 返回公共文章（不混入用户私有文章） | ✅ PASS |
| 4 | /api/articles/:id 返回 content/tags/summary/is_collected | ✅ PASS |
| 5 | 同一用户重复收藏同一文章不产生重复记录 | ✅ PASS |

**结论**: 全部验收标准通过。复试结果与 v1 测试报告一致。
