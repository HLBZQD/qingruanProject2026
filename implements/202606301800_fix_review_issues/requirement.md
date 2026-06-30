# 实现需求：批次6 — P3 前端一般问题

## 来源

审议式三轮代码审查报告 `reviews/202606291800_full_review/todo.md`

## 本批次任务（20个一般问题）

### 注释与命名
- **G1**: main.ts:12 注释 localStorage → sessionStorage
- **G4**: enumLabels.ts LABELS → ENUM_LABELS 或添加注释

### 类型安全
- **G7**: useAuth.ts JwtPayload 索引签名 any → unknown
- **G8**: useMarkdown.ts 修复 `as any` 类型断言
- **G13**: Consultation.vue 4处 `(doctor as any)` → DoctorDetail
- **G32**: helpers.ts 泛型 any[] → unknown[]

### 代码复用与架构
- **G3**: useApi.ts 401 添加 redirect 参数
- **G5**: chatStore localStorage → 统一至 sessionStorage 或标注原因
- **G9**: formatTime 统一使用 helpers.ts 版本
- **G10**: useUI.ts 添加 showLoginRequired() 辅助函数
- **G11**: useApi.ts + chatStore.ts SweetAlert2 动态导入 → 静态导入
- **G15**: Profile.vue 改为调用 authStore.fetchProfile()
- **G16**: DoctorDetail.is_online 从接口移除或新增数据库列
- **G19**: punchStore requestId 从公共导出移除
- **G28**: useUI.ts loadingCounter 移到 composable 内部或标注 SPA-only

### 错误处理与边界情况
- **G22**: DoctorChatView 清空按钮添加 disabled
- **G23**: router /change-password 守卫 replace: true
- **G25**: NewsView sessionStorage 恢复增加类型校验
- **G33**: Login.vue catch 使用 getErrorMessage()

### 类型命名
- **G24**: LoginResponse → LoginData，添加 RegisterData

## 项目根目录

C:\Users\DELL\Desktop\qingruanProject2026
