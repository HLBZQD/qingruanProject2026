# 批次 3 实现需求：公共业务数据接口

## 批次目标
完成前端首页、资讯页、医生咨询页所需的公共数据接口，使系统具备基础内容展示能力。

## 涉及文件
```
server/routes/doctors.js
server/routes/diabetes.js
server/routes/articles.js
server/utils/pagination.js
server/utils/jsonFields.js
```

## 实现内容

### 医生接口
- GET /api/doctors — 分页列表，不返回 chat_token
- GET /api/doctors/:id — 医生详情，不存在返回 404

### 糖尿病类型接口
- GET /api/diabetes-types — 类型列表
- GET /api/diabetes-types/:id — 类型详情（name,image,pathogenesis,manifestation,treatment）

### 文章列表接口
- GET /api/articles — 分页，支持 category 筛选，只返回 user_id IS NULL 的公共文章
- tags 从 TEXT 转为 string[]，summary,views,created_at

### 文章详情接口
- GET /api/articles/:id — 含 content,tags,summary,is_collected（未登录为false）

### 文章收藏接口（登录）
- POST /api/articles/:id/collect — 防重复收藏
- DELETE /api/articles/:id/collect — 只能取消自己的收藏
- GET /api/articles/collections — 分页

### 工具模块
- server/utils/pagination.js — 统一分页（page默认1,pageSize默认20,最大100,totalPages=ceil）
- server/utils/jsonFields.js — tags JSON解析/序列化工具

## 项目根目录
/home/derpyIsTheBest/qingruanProject2026

## 详细设计参考
/home/derpyIsTheBest/qingruanProject2026/docs/2_detailed_design_v3.md 第 3.2.9-3.2.10、3.2.19-3.2.24 节
/home/derpyIsTheBest/qingruanProject2026/docs/3_backend_implementation_batches_v2.md 第 3 批次章节
