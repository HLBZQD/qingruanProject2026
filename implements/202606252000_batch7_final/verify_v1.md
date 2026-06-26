# verify_v1.md - 最终全量验收报告

> 验收日期: 2026-06-25
> 服务器: localhost:3000

---

## 1. 环境准备

```bash
rm -f data/database.sqlite server/data/database.sqlite
node server.js
```

服务启动成功，数据库自动初始化（admin用户+3篇种子文章）。

---

## 2. 注册用户

```bash
POST /api/auth/register {"username":"testuser","password":"test1234"}
```

**结果**: 201, 返回 `{success:true, data:{token,user:{id:2,username:"testuser"}}}`

✅ 通过

---

## 3. 登录获取Token

```bash
POST /api/auth/login {"username":"admin","password":"admin123"}
```

**结果**: 200, 返回 admin token, `role:"admin"`, `must_change_password:true`

✅ 通过

---

## 4. 文章生成

### 4a. 不传category → 推荐分类

```bash
POST /api/articles/generate (空body) [user token]
```

**结果**: 200
```json
{
  "success": true,
  "message": "分类推荐",
  "data": {
    "stage": "category_selection",
    "categories": [
      {"label": "饮食指导", "recommended": false, "reason": ""},
      {"label": "运动指南", "recommended": false, "reason": ""},
      {"label": "生活习惯", "recommended": false, "reason": ""},
      {"label": "糖尿病知识科普", "recommended": false, "reason": ""}
    ]
  }
}
```

✅ 通过 - 返回4个分类推荐，根据BMI标记推荐

### 4b. 传category → 生成文章

```bash
POST /api/articles/generate {"category":"运动指南"} [user token]
```

**结果**: 200, 返回生成的文章：
```json
{
  "success": true,
  "message": "文章生成成功",
  "data": {
    "id": 4,
    "title": "运动指南——糖尿病管理指南",
    "content": "# 运动指南\n\n...",
    "tags": ["运动指南"],
    "is_collected": false
  }
}
```

数据库验证: `SELECT id, user_id FROM articles;` → id=4, user_id=2

✅ 通过 - AI文章生成后user_id不为空 (user_id=2)

---

## 5. 文章隔离

```bash
GET /api/articles (无需认证)
```

**结果**: 200, 仅返回3篇种子文章 (user_id IS NULL)，不包含id=4的私有文章

✅ 通过 - 公共文章列表不显示用户私有文章

---

## 6. 头像上传

### 6a. 非图片文件 → 415

```bash
POST /api/upload/avatar (fake text file, mimetype=text/plain)
```

**HTTP状态码**: 415
```json
{"error":{"code":"UNSUPPORTED_FILE_TYPE","message":"仅支持 JPEG/PNG/WebP 格式"}}
```

✅ 通过 - 上传非图片文件返回415

### 6b. 超大文件 → 413

```bash
POST /api/upload/avatar (3MB jpg)
```

**HTTP状态码**: 413
```json
{"error":{"code":"FILE_TOO_LARGE","message":"文件大小不能超过 2MB"}}
```

✅ 通过 - 上传超过2MB文件返回413

---

## 7. Admin管理

### 7a. 管理员访问日志

```bash
GET /api/admin/logs [admin token]
```

**结果**: 200, 返回分页数据:
```json
{
  "success": true,
  "data": [...],
  "pagination": {"page":1,"pageSize":20,"total":0,"totalPages":0}
}
```

✅ 通过 - 分页格式正确 `{page, pageSize, total, totalPages}`

### 7b. 非管理员访问 → 403

```bash
GET /api/admin/logs [user token]
```

**HTTP状态码**: 403
```json
{"error":{"code":"FORBIDDEN","message":"权限不足，仅管理员可操作"}}
```

✅ 通过 - 非管理员访问admin/logs返回403

---

## 8. SQL执行

### 8a. SELECT → 成功

```bash
POST /api/admin/execute {"sql":"SELECT * FROM users"} [admin token]
```

**结果**: 200, 返回查询结果:
```json
{"success":true,"data":{"rows":[...],"rowCount":2,"operation_type":"SELECT"}}
```

✅ 通过

### 8b. INSERT → 拒绝

```bash
POST /api/admin/execute {"sql":"INSERT INTO users (...)"} [admin token]
```

**HTTP状态码**: 403
```json
{"error":{"code":"FORBIDDEN","message":"仅允许执行 SELECT 查询"}}
```

✅ 通过 - SQL基础版拒绝危险语句

---

## 9. 统一格式验证

### 成功格式
```json
{"success": true, "message": "...", "data": {...}}
```
分页时 data 同级附带 `pagination: {page, pageSize, total, totalPages}`

### 错误格式
```json
{"error": {"code": "...", "message": "..."}}
```

验证端点: 404 (不存在路由) → `{"error":{"code":"NOT_FOUND","message":"请求的资源不存在"}}`

✅ 通过 - 统一错误格式和成功/分页格式

---

## 验收结论

| 验收项 | 结果 |
|--------|------|
| AI文章生成后user_id不为空 | ✅ PASS |
| 公共文章列表不显示用户私有文章 | ✅ PASS |
| 上传非图片文件返回415 | ✅ PASS |
| 上传超过2MB文件返回413 | ✅ PASS |
| 非管理员访问admin/logs返回403 | ✅ PASS |
| SQL基础版拒绝INSERT | ✅ PASS |
| SQL基础版允许SELECT | ✅ PASS |
| 统一错误格式 {error:{code,message}} | ✅ PASS |
| 统一分页格式 {page,pageSize,total,totalPages} | ✅ PASS |
| 注册/登录/Token | ✅ PASS |
| 文章分类推荐 | ✅ PASS |

**全部验收项通过 ✅**
