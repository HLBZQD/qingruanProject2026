const express = require('express');
const { db } = require('../db/database');
const { success, AppError } = require('../utils/response');
const { parsePagination, buildPagination } = require('../utils/pagination');
const { validateRiskPredict } = require('../utils/validators');
const { callWorkflowBlocking } = require('../services/difyService');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function parseRiskOutputRegex(text) {
  // G26: 记录走了回退解析路径，便于运维排查 Dify 输出格式问题
  console.warn('[risk] JSON 解析失败，回退到正则解析 parseRiskOutput');
  const extract = (pattern, text) => {
    const m = text.match(pattern);
    return m ? m[1] : undefined;
  };
  const score = extract(/risk[_ ]?score[:\s]*(\d+)/i, text);
  const level = extract(/risk[_ ]?level[:\s]*['"]?(low|medium|high)['"]?/i, text);
  if (!score) return null;
  return {
    risk_score: Number(score),
    risk_level: level || 'medium',
    risk_level_label: extract(/risk[_ ]?level[_ ]?label[:\s]*['"]?([^'",}\]]+)/i, text) || '',
    risk_level_detail: '',
    diabetes_type: extract(/diabetes[_ ]?type[:\s]*['"]?(type[12]|gestational|other)['"]?/i, text),
    matched_diabetes_type: extract(/matched[_ ]?diabetes[_ ]?type[:\s]*['"]?([^'",}\]]+)/i, text) || '',
    suggestions: [],
    bmi: undefined
  };
}

router.post('/predict', authMiddleware, async (req, res, next) => {
  try {
    const err = validateRiskPredict(req.body);
    if (err) throw new AppError(422, 'VALIDATION_ERROR', err);

    let pregnancy = undefined;
    if (req.body.pregnancy === true) pregnancy = 1;
    if (req.body.pregnancy === false) pregnancy = 0;

    const difyInputs = {
      age: req.body.age,
      gender: req.body.gender,
      height: req.body.height,
      weight: req.body.weight,
      family_history: req.body.family_history,
      diabetes_history: req.body.diabetes_history,
      waist: req.body.waist ?? undefined,
      systolic_bp: req.body.systolic_bp ?? undefined,
      pregnancy: req.body.pregnancy,
      diabetes_type: req.body.diabetes_type ?? undefined
    };

    const difyResponse = await callWorkflowBlocking(
      process.env.DIFY_RISK_WORKFLOW_KEY,
      difyInputs,
      'risk'
    );

    const outputsText = difyResponse.data.outputs.text;
    let parsed;
    try {
      parsed = JSON.parse(outputsText);
    } catch (e) {
      parsed = null;
    }

    if (!parsed) {
      parsed = parseRiskOutputRegex(outputsText);
    }

    if (!parsed) {
      const retryResponse = await callWorkflowBlocking(
        process.env.DIFY_RISK_WORKFLOW_KEY,
        { ...difyInputs, __retry_parse: outputsText },
        'risk'
      );
      try {
        parsed = JSON.parse(retryResponse.data.outputs.text);
      } catch (e) {
        throw new AppError(502, 'RISK_PARSE_ERROR', '风险预测成功但解析失败，请重试');
      }
    }

    const {
      risk_score,
      risk_level,
      risk_level_label,
      risk_level_detail,
      diabetes_type,
      matched_diabetes_type,
      suggestions = [],
      bmi
    } = parsed;

    const advice = risk_level_detail
      + '\n\n### 建议：\n'
      + suggestions.map(s => '- ' + s).join('\n');
    const resultObj = {
      risk_score,
      risk_level,
      risk_level_label,
      matched_diabetes_type,
      advice
    };
    const resultJSON = JSON.stringify(resultObj);

    const stmt = db.prepare(`
      INSERT INTO user_risk_info
        (user_id, age, gender, height, weight, family_history,
         waist, systolic_bp, pregnancy, diabetes_history, diabetes_type, result)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      req.user.user_id,
      req.body.age, req.body.gender, req.body.height, req.body.weight,
      req.body.family_history,
      req.body.waist ?? null,
      req.body.systolic_bp ?? null,
      pregnancy ?? null,
      req.body.diabetes_history,
      diabetes_type ?? null,
      resultJSON
    );
    const recordId = info.lastInsertRowid;

    const record = db.prepare('SELECT created_at FROM user_risk_info WHERE id = ?').get(recordId);

    success(res, {
      record_id: recordId,
      risk_score,
      risk_level,
      risk_level_label,
      matched_diabetes_type,
      advice,
      created_at: record.created_at
    }, '预测完成');
  } catch (e) {
    next(e);
  }
});

router.get('/history', authMiddleware, (req, res, next) => {
  try {
    const { page, pageSize, offset, limit } = parsePagination(req.query);

    const { total } = db.prepare(
      'SELECT COUNT(*) AS total FROM user_risk_info WHERE user_id = ?'
    ).get(req.user.user_id);

    const rows = db.prepare(`
      SELECT
        id,
        CAST(json_extract(result, '$.risk_score') AS INTEGER) AS risk_score,
        json_extract(result, '$.risk_level') AS risk_level,
        json_extract(result, '$.risk_level_label') AS risk_level_label,
        json_extract(result, '$.matched_diabetes_type') AS matched_diabetes_type,
        age,
        gender,
        ROUND(weight / ((height / 100.0) * (height / 100.0)), 2) AS bmi,
        family_history,
        created_at
      FROM user_risk_info
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.user_id, limit, offset);

    const pagination = buildPagination(page, pageSize, total);
    res.status(200).json({ success: true, message: '查询成功', data: rows, pagination });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
