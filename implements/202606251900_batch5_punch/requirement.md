# 批次 5 实现需求：打卡记录与依从性分析闭环

## 批次目标
完成用户执行生活方案后的打卡记录闭环，并提供基础依从性分析。

## 涉及文件
```
server/routes/punch.js
server/utils/pagination.js（已有）
server/utils/dateRange.js
server/utils/response.js（已有）
```

## 实现内容

### 新增打卡 POST /api/punch
- 登录后可用
- 校验 plan_id 必填
- 校验方案项属于当前用户
- punch_type 只能为 diet/exercise
- completion_status 只能为 completed/uncompleted
- 写入 punch_in

### 打卡列表 GET /api/punch/list
- 分页，支持 page/pageSize/startDate/endDate/punch_type 筛选
- 只返回当前用户数据
- LEFT JOIN life_plans 取 plan_title
- 统一分页结构

### 打卡分析 GET /api/punch/analysis
- 第一版本地统计（不强依赖 Dify）
- 返回：饮食完成率、运动完成率、总打卡次数、近7天趋势、依从性评语、改进建议
- SQL中 GROUP BY date 聚合近7天数据

## 项目根目录
/home/derpyIsTheBest/qingruanProject2026

## 详细设计参考
/home/derpyIsTheBest/qingruanProject2026/docs/2_detailed_design_v3.md 第 3.2.16-3.2.18 节
/home/derpyIsTheBest/qingruanProject2026/docs/3_backend_implementation_batches_v2.md 第 5 批次章节
