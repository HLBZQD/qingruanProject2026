# verify_v1.md — 验收测试结果（从零重跑）

## 测试环境
- 数据库: data/database.sqlite (清空重建)
- 服务器: node server.js, 端口 3000, PID 39828
- Mock模式: DIFY_API_BASE_URL 未设置, 使用内置 mock 数据
- 时间: 2026-06-25 18:44

## 测试步骤与结果

### Step 1: 注册用户
- POST /api/auth/register
- 请求: `{"username":"testuser1","password":"Test1234"}`
- 结果: `201 Created`, 返回 token + user 信息 (id=2)
- **✅ PASS**

### Step 2: 登录
- POST /api/auth/login
- 请求: `{"username":"testuser1","password":"Test1234"}`
- 结果: `200 OK`, 返回 token + user 信息
- **✅ PASS**

### Step 3: 风险预测提交
- POST /api/risk/predict
- 请求1: age=45, gender=male, height=170, weight=75, family_history=yes, diabetes_history=prediabetes
  - 返回: record_id=1, risk_score=15, risk_level=medium, risk_level_label="中风险", matched_diabetes_type="2型糖尿病"
- 请求2 (二次): age=30, gender=female, height=165, weight=60, family_history=no, diabetes_history=healthy
  - 返回: record_id=2, risk_score=15, risk_level=medium, risk_level_label="中风险", matched_diabetes_type="2型糖尿病"
- 请求3: 再次验证结构完整性，所有字段 (record_id, risk_score, risk_level, risk_level_label, matched_diabetes_type, advice, created_at) 均存在且非空
- **✅ PASS** — 风险预测结果保存到 user_risk_info

### Step 4: 风险历史查询（分页 + BMI计算）
- GET /api/risk/history?page=1&pageSize=20
- 结果: 返回2条记录, 分页信息 page=1, pageSize=20, total=2, totalPages=1
- BMI 计算: 
  - 170cm/75kg → BMI 25.95 ✅ (75 / 1.7² = 75/2.89 = 25.95)
  - 165cm/60kg → BMI 22.04 ✅ (60 / 1.65² = 60/2.7225 = 22.04)
- **✅ PASS** — 分页正确, BMI计算正确

### Step 5: 生成生活方案
- POST /api/plan/generate
- 请求: health_info={age:45,gender:male,height:170,weight:75} + preferences={dietary:"balanced",activity:"moderate"}
- Mock 返回: 4条 diet 方案 + 3条 exercise 方案, plan_id=1
- 结果: `200 OK`, plan_id=1, diet_plans(4), exercise_plans(3), other_plans(0)
- 所有计划项均含: plan_type, order_num, time_desc, title, content (Mock 结构验证通过)
- **✅ PASS** — 用户可以生成生活方案

### Step 6: 查询当前活跃方案（首次）
- GET /api/plan/current
- 结果: plan_id=1, 7条计划项, is_active=1
- **✅ PASS** — 只返回一套当前活跃方案

### Step 7: 调整方案（旧方案逻辑过期）
- PUT /api/plan/adjust
- 请求: plan_id=1, feedback="希望增加更多运动项目"
- Mock 返回: 新方案 plan_id=2, 4条 diet + 3条 exercise
- 旧 plan_id=1 被标记 is_active=0
- **✅ PASS** — 旧方案被逻辑过期

### Step 8: 调整后查询当前方案（二次验证）
- GET /api/plan/current
- 结果: plan_id=2 (不再是 plan_id=1), 7条计划项, is_active=1
- **✅ PASS** — /api/plan/current 只返回当前活跃方案 plan_id=2

### Mock 模式结构验证
- 风险预测返回字段: record_id ✅, risk_score ✅, risk_level ✅, risk_level_label ✅, matched_diabetes_type ✅, advice ✅, created_at ✅
- 方案生成返回字段: plan_id ✅, diet_plans[] ✅, exercise_plans[] ✅, other_plans[] ✅
- 方案项均含: plan_type ✅, order_num ✅, time_desc ✅, title ✅, content ✅
- **✅ PASS** — Mock模式返回结构正确的数据

## 总结

| 验收标准 | 结果 |
|----------|------|
| 登录用户可以提交风险预测 | ✅ |
| 风险预测结果保存到 user_risk_info | ✅ |
| 用户可以生成生活方案 | ✅ |
| 旧方案会被逻辑过期 | ✅ |
| /api/plan/current 只返回一套当前活跃方案 | ✅ |
| Mock模式仍可返回结构正确的数据 | ✅ |

**全部验收标准通过: VERIFIED**
