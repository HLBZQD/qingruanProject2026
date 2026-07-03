const express = require('express');
const { getAdapter } = require('../db/database');
const { success, error, AppError } = require('../utils/response');
const { validatePunch } = require('../utils/validators');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { callWorkflowBlocking } = require('../services/difyService');
const { extractJson } = require('../utils/extractJson');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();

    const validationError = validatePunch(req.body);
    if (validationError) {
      return error(res, 'VALIDATION_ERROR', validationError, 422);
    }

    const planItem = await adapter.queryOne(
      'SELECT id, user_id FROM life_plans WHERE id = ? AND is_active = 1',
      [req.body.plan_id]
    );
    if (!planItem) {
      return error(res, 'NOT_FOUND', '方案项不存在或已失效', 404);
    }
    if (planItem.user_id !== req.user.user_id) {
      return error(res, 'FORBIDDEN', '无权操作他人方案', 403);
    }

    const result = await adapter.execute(
      'INSERT INTO punch_in (user_id, plan_item_id, punch_type, completion_status, remarks) VALUES (?, ?, ?, ?, ?)',
      [req.user.user_id, req.body.plan_id, req.body.punch_type, req.body.completion_status, req.body.remarks || '']
    );

    const punch = await adapter.queryOne(
      'SELECT p.id, p.user_id, p.plan_item_id, p.punch_time, p.punch_type, p.completion_status, p.remarks, l.title AS plan_title FROM punch_in p LEFT JOIN life_plans l ON p.plan_item_id = l.id WHERE p.id = ?',
      [result.lastInsertId]
    );

    success(res, punch, '打卡成功', 201);
  } catch (e) {
    next(e);
  }
});

router.get('/list', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const { page, pageSize, offset, limit } = parsePagination(req.query);

    const whereFragments = ['p.user_id = ?'];
    const params = [req.user.user_id];

    if (req.query.start_date) {
      whereFragments.push('p.punch_time >= ?');
      params.push(req.query.start_date);
    }
    if (req.query.end_date) {
      whereFragments.push('p.punch_time <= ?');
      params.push(req.query.end_date);
    }
    if (req.query.punch_type) {
      whereFragments.push('p.punch_type = ?');
      params.push(req.query.punch_type);
    }

    const whereClause = whereFragments.join(' AND ');

    const countRows = await adapter.query(
      `SELECT COUNT(*) AS total FROM punch_in p WHERE ${whereClause}`,
      params
    );
    const total = countRows[0].total;

    const rows = await adapter.query(
      `SELECT p.id, p.plan_item_id, p.punch_type, p.completion_status, p.remarks, p.punch_time, l.title AS plan_title FROM punch_in p LEFT JOIN life_plans l ON p.plan_item_id = l.id WHERE ${whereClause} ORDER BY p.punch_time DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const pagination = buildPagination(page, pageSize, total);
    res.status(200).json({ success: true, message: '查询成功', data: rows, pagination });
  } catch (e) {
    next(e);
  }
});

// ========== 打卡分析辅助函数 ==========

const DEFAULT_SUGGESTIONS = ['建议保持规律的打卡习惯', '如有疑问请咨询医生'];

function formatDateKey(d) {
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return `${Y}-${M}-${D}`;
}

// 基于预查询的打卡记录数组在 Express 侧计算统计指标（镜像 Dify 工作流统计代码节点逻辑）
// 用于 Mock 降级与 Dify 调用异常时的兜底，确保前端始终拿到结构完备的 PunchAnalysisResponse
function calculateStats(records) {
  const dietRecords = records.filter(r => r.punch_type === 'diet');
  const exerciseRecords = records.filter(r => r.punch_type === 'exercise');

  const totalPunches = records.length;
  const dietTotal = dietRecords.length;
  const exerciseTotal = exerciseRecords.length;
  const dietCompleted = dietRecords.filter(r => r.completion_status === 'completed').length;
  const exerciseCompleted = exerciseRecords.filter(r => r.completion_status === 'completed').length;

  const dietCompletionRate = dietTotal > 0 ? Math.round((dietCompleted / dietTotal) * 100) / 100 : 0;
  const exerciseCompletionRate = exerciseTotal > 0 ? Math.round((exerciseCompleted / exerciseTotal) * 100) / 100 : 0;

  // 近 7 天趋势（本地时间），与 punch_in 表 datetime('now','localtime') 存储口径一致
  const trendMap = {};
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = formatDateKey(d);
    trendMap[key] = { date: key, diet_completed: 0, exercise_completed: 0 };
  }

  for (const r of records) {
    if (r.completion_status !== 'completed' || !r.punch_time) continue;
    const dayKey = String(r.punch_time).slice(0, 10);
    if (trendMap[dayKey]) {
      if (r.punch_type === 'diet') trendMap[dayKey].diet_completed++;
      else if (r.punch_type === 'exercise') trendMap[dayKey].exercise_completed++;
    }
  }

  return {
    diet_completion_rate: dietCompletionRate,
    exercise_completion_rate: exerciseCompletionRate,
    total_punches: totalPunches,
    last_7_days_trend: Object.values(trendMap)
  };
}

// 兜底分析结果：真实统计 + 默认 AI 评语（Dify 未配置或调用异常时使用）
function buildFallbackAnalysis(records, comment) {
  const stats = calculateStats(records);
  return {
    diet_completion_rate: stats.diet_completion_rate,
    exercise_completion_rate: stats.exercise_completion_rate,
    total_punches: stats.total_punches,
    last_7_days_trend: stats.last_7_days_trend,
    adherence_comment: comment,
    improvement_suggestions: DEFAULT_SUGGESTIONS
  };
}

// 解析安全默认值（设计 §5.2.4 第三层兜底）
const SAFE_DEFAULT_ANALYSIS = {
  diet_completion_rate: 0,
  exercise_completion_rate: 0,
  total_punches: 0,
  last_7_days_trend: [],
  adherence_comment: '打卡数据解析失败，请稍后再试。',
  improvement_suggestions: DEFAULT_SUGGESTIONS
};

// 规范化 Dify 输出对象为 PunchAnalysisResponse 契约格式（容忍类型偏差与包装形态）
// 参照 admin.js write_life_plans 的 items 归一化模式：
// Dify 的 json_object 类型约束会导致工作流内部把数组/结果包装在对象里，
// Express 侧需兼容多种形态，避免因 Dify 工作流配置差异而解析失败。
function normalizeAnalysis(parsed) {
  if (parsed == null) return null;

  // 形态 1：parsed 可能是 JSON 字符串（Dify outputs.text 未被 extractJson 解析时）
  let obj = parsed;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;

  // 形态 2：包装对象——Dify 工作流结果合并节点可能把整个分析结果包在 result/data/analysis 等键下
  // 检测：当前对象不含核心字段（diet_completion_rate / adherence_comment），但有包装键
  if (!('diet_completion_rate' in obj) && !('adherence_comment' in obj)) {
    const wrapperKeys = ['result', 'data', 'analysis', 'output', 'outputs', 'value'];
    for (const key of wrapperKeys) {
      const inner = obj[key];
      if (inner && typeof inner === 'object' &&
          ('diet_completion_rate' in inner || 'adherence_comment' in inner)) {
        obj = inner;
        break;
      }
    }
  }

  // 归一化 last_7_days_trend：兼容 数组 / JSON 字符串 / 包装对象
  let trend = obj.last_7_days_trend;
  if (typeof trend === 'string') {
    try { trend = JSON.parse(trend); } catch { trend = []; }
  }
  if (trend && typeof trend === 'object' && !Array.isArray(trend)) {
    // 包装对象 {trend:[...]} / {data:[...]} / {items:[...]} / {records:[...]}
    trend = trend.trend || trend.data || trend.items || trend.records || trend.list || [];
  }
  if (!Array.isArray(trend)) trend = [];

  // 归一化 improvement_suggestions：兼容 数组 / JSON 字符串 / 包装对象
  let suggestionsArr = [];
  const suggestions = obj.improvement_suggestions;
  if (Array.isArray(suggestions)) {
    suggestionsArr = suggestions.map(s => String(s));
  } else if (typeof suggestions === 'string') {
    try {
      const p = JSON.parse(suggestions);
      suggestionsArr = Array.isArray(p) ? p.map(s => String(s)) : [suggestions];
    } catch {
      suggestionsArr = [suggestions];
    }
  } else if (suggestions && typeof suggestions === 'object') {
    // 包装对象 {suggestions:[...]} / {items:[...]} / {list:[...]}
    const arr = suggestions.suggestions || suggestions.items || suggestions.list || [];
    suggestionsArr = Array.isArray(arr) ? arr.map(s => String(s)) : [];
  }

  return {
    diet_completion_rate: Number(obj.diet_completion_rate) || 0,
    exercise_completion_rate: Number(obj.exercise_completion_rate) || 0,
    total_punches: Number(obj.total_punches) || 0,
    last_7_days_trend: trend,
    adherence_comment: String(obj.adherence_comment || ''),
    improvement_suggestions: suggestionsArr
  };
}

router.get('/analysis', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();

    // 1. 查询 punch_in 记录，构造 punch_records 数组（注入 Dify 工作流输入变量）
    const punchRecords = await adapter.query(
      'SELECT plan_item_id, punch_type, completion_status, punch_time, remarks FROM punch_in WHERE user_id = ? ORDER BY punch_time ASC',
      [req.user.user_id]
    );

    const difyBase = process.env.DIFY_API_BASE;
    const difyKey = process.env.DIFY_PUNCH_WORKFLOW_KEY;

    // 2. Dify 未配置 → Mock 降级：返回真实统计 + 默认 AI 评语
    if (!difyBase || !difyKey) {
      console.log('[punch/analysis] Mock 模式：DIFY_PUNCH_WORKFLOW_KEY 未配置，返回本地统计 + 默认评语');
      return success(res, buildFallbackAnalysis(punchRecords, 'AI 分析服务暂不可用，请稍后重试。'), '查询成功', 200);
    }

    // 3. 调用 Dify punch-analysis 工作流
    // ⚠️ Dify 工作流开始节点的 punch_records 变量必须声明为 json_object 类型
    // （Dify 不支持 Array 类型输入变量，裸数组会被拒绝）。
    // Express 将打卡记录数组包装为 { records: [...] } 对象传入，
    // Dify 代码节点需通过 punch_records.records 取出数组（详见 docs/todo.md 步骤 1）。
    let difyResponse;
    try {
      difyResponse = await callWorkflowBlocking(
        difyKey,
        { punch_records: { records: punchRecords } },
        'punch'
      );
    } catch (difyErr) {
      // Dify 调用异常（超时/网络/5xx）→ 降级为本地统计 + 默认评语，不阻断前端分析区
      console.error('[punch/analysis] Dify 调用异常，降级本地统计:', difyErr.message);
      return success(res, buildFallbackAnalysis(punchRecords, 'AI 分析服务暂时不可用，已为您展示统计数据。'), '查询成功', 200);
    }

    // 4. 解析 Dify 输出（三层降级，参照设计 §5.2.4）
    const outputsText = (difyResponse.data && difyResponse.data.outputs)
      ? difyResponse.data.outputs.text
      : (difyResponse.outputs ? difyResponse.outputs.text : null);

    let parsed = null;
    if (outputsText) {
      // 第一层：直接解析；第二层：extractJson 剥离 ```json/```<think> 包裹与括号配对提取
      parsed = extractJson(outputsText);
    }

    const normalized = normalizeAnalysis(parsed);

    // 第三层：安全默认值兜底
    if (!normalized) {
      console.warn('[punch/analysis] Dify 输出解析失败，返回安全默认值');
      success(res, { ...SAFE_DEFAULT_ANALYSIS }, '查询成功', 200);
    } else {
      success(res, normalized, '查询成功', 200);
    }
  } catch (e) {
    next(e);
  }
});

module.exports = router;
