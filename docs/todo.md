# punch-analysis 工作流后端集成 TODO

## 1. 当前状态

### 1.1 设计文档（§5.2.4 + §5.3.4）

| 维度 | 设计 |
|------|------|
| 应用类型 | Workflow（工作流） |
| 调用模式 | blocking |
| 输入变量 | `punch_records`（Express 预查询 `punch_in` 表后注入） |
| 节点编排 | 开始 → 代码节点(统计) → LLM节点(评语) → 代码节点(合并) → 结束 |
| 输出字段 | `diet_completion_rate`, `exercise_completion_rate`, `total_punches`, `last_7_days_trend`, `adherence_comment`, `improvement_suggestions` |

### 1.2 后端当前实现（`server/routes/punch.js:89-120`）

- `GET /api/punch/analysis` 仅在 Express 内完成统计计算（`total_punches`, `type_stats`, `trend_7d`）
- **未调用 Dify** 工作流
- **未返回** `adherence_comment` 和 `improvement_suggestions`（AI 评语字段）
- `.env` 中不存在 `DIFY_PUNCH_WORKFLOW_KEY` 环境变量

### 1.3 前端期望

`Punch.vue` 已完整渲染 `PunchAnalysisResponse` 类型（`src/types/api.ts:288-311`）的全部字段：

```typescript
interface PunchAnalysisResponse {
  diet_completion_rate: number;
  exercise_completion_rate: number;
  total_punches: number;
  last_7_days_trend: Array<{ date: string; diet_completed: number; exercise_completed: number }>;
  adherence_comment: string;        // AI 生成，Markdown 格式
  improvement_suggestions: string[]; // AI 生成
}
```

前端目前因后端未返回这些字段，AI 分析区域显示为空或降级兜底状态。

---

## 2. 实现计划

### 步骤 1：Dify 平台搭建工作流

按以下编排在 Dify 创建 `punch-analysis` Workflow：

#### 1.1 开始节点 → 输入变量

| 变量名 | 类型 | 必填 |
|--------|------|------|
| `punch_records` | Array\[Object\] | 是 |

每条记录结构对齐 `punch_in` 表：
```json
{
  "plan_item_id": 1,
  "punch_type": "diet",
  "completion_status": "completed",
  "punch_time": "2026-06-23T07:30:00",
  "remarks": ""
}
```

#### 1.2 代码节点 → 统计计算

```python
import json
from datetime import datetime, timedelta

def main(punch_records: list) -> dict:
    records = punch_records
    diet_records = [r for r in records if r.get("punch_type") == "diet"]
    exercise_records = [r for r in records if r.get("punch_type") == "exercise"]
    
    total_punches = len(records)
    diet_total = len(diet_records)
    exercise_total = len(exercise_records)
    diet_completed = sum(1 for r in diet_records if r.get("completion_status") == "completed")
    exercise_completed = sum(1 for r in exercise_records if r.get("completion_status") == "completed")
    
    diet_completion_rate = round(diet_completed / diet_total, 2) if diet_total > 0 else 0.0
    exercise_completion_rate = round(exercise_completed / exercise_total, 2) if exercise_total > 0 else 0.0
    
    today = datetime.now().date()
    trend_map = {}
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        trend_map[d.isoformat()] = {"diet_completed": 0, "exercise_completed": 0}
    
    for r in records:
        t = r.get("punch_time", "")
        if t and r.get("completion_status") == "completed":
            d = t[:10]
            if d in trend_map:
                if r.get("punch_type") == "diet":
                    trend_map[d]["diet_completed"] += 1
                elif r.get("punch_type") == "exercise":
                    trend_map[d]["exercise_completed"] += 1
    
    trend = [{"date": k, **v} for k, v in trend_map.items()]
    
    return {
        "diet_completion_rate": diet_completion_rate,
        "exercise_completion_rate": exercise_completion_rate,
        "total_punches": total_punches,
        "diet_completed": diet_completed,
        "diet_total": diet_total,
        "exercise_completed": exercise_completed,
        "exercise_total": exercise_total,
        "last_7_days_trend": json.dumps(trend, ensure_ascii=False),
        "stats_text": f"饮食完成率：{diet_completion_rate*100:.0f}%（{diet_completed}/{diet_total}），运动完成率：{exercise_completion_rate*100:.0f}%（{exercise_completed}/{exercise_total}），总打卡 {total_punches} 次。"
    }
```

#### 1.3 LLM 节点 → AI 评语

模型：DeepSeek-V3 / DeepSeek-R1

System Prompt：

```
你是一个专业的健康数据分析师。你的职责是对用户的饮食和运动打卡记录进行分析，提供客观的依从性评估和改进建议。

# 分析维度
1. 按类型汇总: 饮食/运动打卡完成率
2. 近7天趋势: 每日完成数量及变化趋势
3. 依从性评语: 综合评估用户的方案执行情况
4. 改进建议: 2-3条具体可执行的改进措施

# 注意事项
- 分析基于客观数据，不做主观猜测
- 如果打卡数据不足7天，标注数据量提示
- 改进建议要具体、可操作，避免笼统的"多运动"
- adherence_comment 使用 Markdown 格式（含加粗、列表等）
```

User Prompt：

```
请分析以下用户打卡数据：

{{#CodeNode.stats_text#}}

你必须只输出一个纯 JSON 对象（不要```json包裹）：

{
  "adherence_comment": "依从性评语（Markdown格式，含加粗、列表）",
  "improvement_suggestions": ["建议1", "建议2"]
}
```

#### 1.4 代码节点 → 结果合并

```python
import json

def main(
    diet_completion_rate: float,
    exercise_completion_rate: float,
    total_punches: int,
    last_7_days_trend: str,
    adherence_comment: str,
    improvement_suggestions: str
) -> dict:
    try:
        suggestions = json.loads(improvement_suggestions)
        if not isinstance(suggestions, list):
            suggestions = []
    except:
        suggestions = []
    
    try:
        trend = json.loads(last_7_days_trend)
    except:
        trend = []
    
    return {
        "diet_completion_rate": diet_completion_rate,
        "exercise_completion_rate": exercise_completion_rate,
        "total_punches": total_punches,
        "last_7_days_trend": trend,
        "adherence_comment": adherence_comment,
        "improvement_suggestions": suggestions
    }
```

#### 1.5 节点编排

```
开始(punch_records) → 代码节点(统计) → LLM节点(评语) → 代码节点(合并) → 结束
```

#### 1.6 发布

发布后获取 API Key，记录为下一步使用。

---

### 步骤 2：后端 punch.js 接入 Dify

参照现有模式（`risk.js:58-62`、`plan.js:38-42`、`articles.js:142`）：

#### 2.1 引入依赖

```javascript
// server/routes/punch.js 顶部新增
const { callWorkflowBlocking } = require('../services/difyService');
```

#### 2.2 重写 `GET /api/punch/analysis`

现有端点（第89-120行）替换为：

```javascript
router.get('/analysis', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();

    // 1. 查询 punch_in 记录，构造 punch_records 数组
    const punchRecords = await adapter.query(
      'SELECT plan_item_id, punch_type, completion_status, punch_time, remarks FROM punch_in WHERE user_id = ? ORDER BY punch_time ASC',
      [req.user.user_id]
    );

    // 2. 调用 Dify 工作流
    const difyKey = process.env.DIFY_PUNCH_WORKFLOW_KEY;
    const difyBase = process.env.DIFY_API_BASE;

    if (!difyBase || !difyKey) {
      // Mock 降级：仅返回统计数据，AI 评语为默认文案
      const stats = calculateStats(punchRecords); // 复用现有统计逻辑
      return success(res, {
        diet_completion_rate: stats.dietCompletionRate,
        exercise_completion_rate: stats.exerciseCompletionRate,
        total_punches: stats.totalPunches,
        last_7_days_trend: stats.trend,
        adherence_comment: 'AI 分析服务暂不可用，请稍后重试。',
        improvement_suggestions: ['建议保持规律的打卡习惯', '如有疑问请咨询医生']
      }, '查询成功', 200);
    }

    const difyInputs = { punch_records: punchRecords };
    const difyResponse = await callWorkflowBlocking(difyKey, difyInputs, 'punch');

    // 3. 解析 Dify 输出（三层降级，参照设计 §5.2.4）
    const outputsText = (difyResponse.data && difyResponse.data.outputs)
      ? difyResponse.data.outputs.text
      : (difyResponse.outputs ? difyResponse.outputs.text : null);

    let parsed = null;
    if (outputsText) {
      try {
        parsed = typeof outputsText === 'string' ? JSON.parse(outputsText) : outputsText;
      } catch (e) {
        // 正则降级：提取被包裹的 JSON
        const match = String(outputsText).match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch (_) {}
        }
      }
    }

    if (!parsed) {
      // 安全默认值兜底
      parsed = {
        diet_completion_rate: 0,
        exercise_completion_rate: 0,
        total_punches: 0,
        last_7_days_trend: [],
        adherence_comment: '打卡数据解析失败，请稍后再试。',
        improvement_suggestions: ['建议保持规律的打卡习惯', '如有疑问请咨询医生']
      };
    }

    success(res, parsed, '查询成功', 200);
  } catch (e) {
    next(e);
  }
});
```

#### 2.3 删除旧的 stats 计算逻辑

当前端点中第93-116行的 SQL 查询和统计计算逻辑，移到上述的 Mock 降级分支中（`calculateStats` 辅助函数），正常流程由 Dify 工作流完成。

---

### 步骤 3：添加环境变量

在 `.env` 和 `.env.example` 中新增：

```env
# punch-analysis（Workflow）
DIFY_PUNCH_WORKFLOW_KEY=app-xxxxxxxxxxxxxxxxxxxxxxxx
```

---

### 步骤 4：验证

```bash
# 1. 确认 env 已配置
grep DIFY_PUNCH .env

# 2. 调用分析端点（需先有打卡记录）
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/punch/analysis

# 3. 验证响应包含所有 6 个字段
# diet_completion_rate, exercise_completion_rate, total_punches,
# last_7_days_trend, adherence_comment, improvement_suggestions
```

---

## 3. 影响范围

| 文件 | 变更 |
|------|------|
| `server/routes/punch.js` | 重写 `/analysis` 端点，新增 `callWorkflowBlocking` 调用 |
| `.env` | 新增 `DIFY_PUNCH_WORKFLOW_KEY` |
| `.env.example` | 同上 |
| Dify 平台 | 新建 `punch-analysis` Workflow 并发布 |

无前端变更——`Punch.vue` 和 `usePunchApi.ts` 已按完整 `PunchAnalysisResponse` 类型编写，后端对齐后即可生效。
