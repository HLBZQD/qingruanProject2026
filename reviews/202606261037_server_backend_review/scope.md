# 审查范围界定

## 审查目标
对 `server/` 目录下的 Express 后端代码进行全面代码审查，确认实现是否符合 `docs/2_detailed_design_v3.md` 详细设计文档的规范。

## 审查依据
1. **详细设计文档**: `docs/2_detailed_design_v3.md` — 包含完整的后端 API 规范、数据模型、错误处理约定、分页约定、JWT 认证约定、中间件规范
2. **项目已有代码风格**: `server/` 目录下的现有代码模式作为审查基线
3. **前序审议式实现产物**: `implements/` 目录下 7 个批次的计划、设计、代码审查记录

## 审查范围
`server/` 目录下所有源代码文件（共约 27 个 JS 文件），分为两个审查分组并行进行。

## 审查重点
| 维度 | 关注点 |
|------|--------|
| 正确性 | 逻辑错误、边界条件、异常路径、SQL 注入防护、参数化查询 |
| 设计符合性 | 与设计文档的 API 端点、数据模型、错误码、分页格式是否一致 |
| 安全性 | JWT 认证链、角色校验、API Key 认证、敏感数据保护 |
| 错误处理 | 统一错误格式 `{ error: { code, message } }`，状态码使用是否正确 |
| 可维护性 | 代码复用、命名规范、职责划分 |

## 排除范围
- 前端代码（`src/`）
- 静态资源（`static/`）
- 配置文件（`.env`, `package.json` 等）
- 数据库 SQL 文件（`init.sql`, `seed.sql`）— 仅检查 JS 中对数据库的操作

## 背景
此前已完成 7 个批次的审议式实现迭代（`implements/` 目录）：
1. batch1_backend_foundation — 后端基础搭建
2. batch2_auth — 认证模块
3. batch3_public_data — 公共数据模块
4. batch4_risk_plan — 风险预测与生活方案
5. batch5_punch — 打卡模块
6. batch6_sse_chat — SSE 聊天模块
7. batch7_final — 收尾批次（admin/upload/articles生成/DIFY变量名修正）

各批次均有对应的 plan、detail、code、code_review 记录可供参考。
