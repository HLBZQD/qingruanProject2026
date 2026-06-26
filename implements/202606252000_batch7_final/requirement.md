# 批次 7 实现需求：扩展接口、管理基础与统一验收

## 批次目标
补齐主要扩展接口，并对所有接口进行统一收口、错误处理和联调验收，形成可交付后端版本。

## 涉及文件
```
server/routes/articles.js（扩展）
server/routes/upload.js
server/routes/admin.js
server/middleware/errorHandler.js（已有）
server/utils/pagination.js（已有）
server/utils/response.js（已有）
server/utils/validators.js（扩展）
```

## 实现内容

### AI 文章生成 POST /api/articles/generate
- 扩展 articles.js
- 未传 category 返回推荐分类
- 传入 category 调用 Dify 文章工作流（Mock兜底）
- 生成文章写入 articles（绑定 user_id）
- 用户生成文章不进入公共列表

### 头像上传 POST /api/upload/avatar
- multipart/form-data, 字段名 avatar
- 仅允许 JPEG/PNG/WebP, ≤2MB
- 保存至 /static/uploads/avatars/
- 返回头像 URL

### 管理日志 GET /api/admin/logs
- 仅管理员
- 分页，JOIN users 取 operator_username
- 按时间倒序

### SQL 执行基础版 POST /api/admin/execute
- 仅管理员
- 仅允许 SELECT
- 禁止 INSERT/UPDATE/DELETE/DROP/ALTER
- 记录 admin_logs

### 统一错误处理完善
- 确保所有错误返回 { error: { code, message } }
- 覆盖所有错误码（400-504）

### 统一分页完善
- page默认1, pageSize默认20, 最大100
- totalPages = Math.ceil(total/pageSize)

### 最终验收
按顺序验收全部19个端点

## DIFY_API_BASE 变量名修正
sseProxy.js 和 difyService.js 中使用的 DIFY_API_BASE_URL 改为 DIFY_API_BASE（与.env一致）

## 项目根目录
/home/derpyIsTheBest/qingruanProject2026

## 详细设计参考
/home/derpyIsTheBest/qingruanProject2026/docs/2_detailed_design_v3.md 第 3.2.21, 3.2.29-3.2.31 节
/home/derpyIsTheBest/qingruanProject2026/docs/3_backend_implementation_batches_v2.md 第 7 批次章节
