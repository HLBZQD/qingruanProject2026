# 批次 4 实现需求：风险预测与生活方案核心闭环

## 批次目标
完成系统最核心的 AI 业务闭环：用户提交健康信息后获得风险预测结果，并基于风险预测生成个性化生活方案。

## 涉及文件
```
server/services/difyService.js
server/routes/risk.js
server/routes/plan.js
server/utils/validators.js（扩展）
server/utils/planParser.js
server/utils/response.js（已有）
```

## 实现内容

### Dify Blocking 工作流封装 (server/services/difyService.js)
- callWorkflowBlocking(apiKey, inputs) — 调用 Dify /workflows/run，blocking模式
- 支持超时控制（15s），Dify 非200错误处理，Mock兜底

### 风险预测 POST /api/risk/predict
- 校验必填字段，枚举值英文小写
- waist/systolic_bp 不允许为0
- pregnancy boolean→INTEGER 转换
- 调用 Dify 风险工作流（或Mock）
- 写入 user_risk_info
- 返回 risk_score/risk_level/risk_level_label/matched_diabetes_type/advice/created_at

### 风险历史 GET /api/risk/history
- 分页，当前用户记录
- SQL中计算BMI，json_extract提取风险字段

### 生活方案生成 POST /api/plan/generate
- 生成新plan_id（MAX(plan_id)+1）
- 旧方案is_active=0
- 调用 Dify 方案工作流（或Mock）
- 解析方案项（饮食4项+运动3项+other）
- 写入 life_plans
- 返回 diet_plans/exercise_plans/other_plans

### 当前方案查询 GET /api/plan/current
- 最新活跃方案组
- 按plan_type+order_num排序
- 无方案返回 null

### 方案调整 PUT /api/plan/adjust
- 根据plan_id过期旧方案组
- 重新生成方案
- 返回新方案

## Mock 兜底数据
Dify 不可用时返回结构正确的硬编码 Mock 数据。

## 项目根目录
/home/derpyIsTheBest/qingruanProject2026

## 详细设计参考
/home/derpyIsTheBest/qingruanProject2026/docs/2_detailed_design_v3.md 第 3.2.7-3.2.15 节、第 5 章
/home/derpyIsTheBest/qingruanProject2026/docs/3_backend_implementation_batches_v2.md 第 4 批次章节
