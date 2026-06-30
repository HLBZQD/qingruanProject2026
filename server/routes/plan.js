const express = require('express');
const { db } = require('../db/database');
const { success, AppError } = require('../utils/response');
const { validatePlanGenerate, validatePlanAdjust } = require('../utils/validators');
const { callWorkflowBlocking } = require('../services/difyService');
const { parsePlanOutput } = require('../utils/planParser');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const lastGenerateRequest = new Map();

function checkIdempotent(userId) {
  const lastAt = lastGenerateRequest.get(userId);
  const now = Date.now();
  if (lastAt && (now - lastAt) < 30000) {
    return false;
  }
  lastGenerateRequest.set(userId, now);
  return true;
}

router.post('/generate', authMiddleware, async (req, res, next) => {
  try {
    const err = validatePlanGenerate(req.body);
    if (err) throw new AppError(422, 'VALIDATION_ERROR', err);

    // G12: 幂等检查移至 Dify API 调用之前，防止重复调用消耗 API token
    if (!checkIdempotent(req.user.user_id)) {
      throw new AppError(409, 'CONFLICT', '请求过于频繁，请稍后再试');
    }

    const difyResponse = await callWorkflowBlocking(
      process.env.DIFY_PLAN_WORKFLOW_KEY,
      {
        health_info: req.body.health_info,
        preferences: req.body.preferences
      },
      'plan'
    );

    const { items } = await parsePlanOutput(
      difyResponse.data.outputs.text,
      process.env.DIFY_PLAN_WORKFLOW_KEY,
      callWorkflowBlocking,
      { health_info: req.body.health_info, preferences: req.body.preferences }
    );

    const planData = db.transaction(() => {
      db.prepare(`
        UPDATE life_plans SET is_active = 0, updated_at = datetime('now','localtime')
        WHERE user_id = ? AND is_active = 1
      `).run(req.user.user_id);

      const { maxId } = db.prepare(`
        SELECT COALESCE(MAX(plan_id), 0) + 1 AS maxId
        FROM life_plans WHERE user_id = ?
      `).get(req.user.user_id);
      const planId = maxId;

      const insertStmt = db.prepare(`
        INSERT INTO life_plans (user_id, plan_id, plan_type, order_num, time_desc, title, content, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);
      for (const item of items) {
        insertStmt.run(
          req.user.user_id,
          planId,
          item.plan_type,
          item.order_num,
          item.time_desc || '',
          item.title,
          item.content
        );
      }

      return { planId };
    })();

    const planRows = db.prepare(`
      SELECT id, plan_type, order_num, time_desc, title, content
      FROM life_plans
      WHERE user_id = ? AND plan_id = ? AND is_active = 1
      ORDER BY plan_type, order_num
    `).all(req.user.user_id, planData.planId);

    const dietPlans = planRows.filter(r => r.plan_type === 'diet');
    const exercisePlans = planRows.filter(r => r.plan_type === 'exercise');
    const otherPlans = planRows.filter(r => r.plan_type === 'other');

    success(res, {
      plan_id: planData.planId,
      diet_plans: dietPlans,
      exercise_plans: exercisePlans,
      other_plans: otherPlans || []
    }, '方案生成成功');
  } catch (e) {
    next(e);
  }
});

router.get('/current', authMiddleware, (req, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT id, plan_id, plan_type, order_num, time_desc, title, content, is_active, created_at
      FROM life_plans
      WHERE user_id = ? AND is_active = 1
        AND plan_id = (
          SELECT MAX(plan_id) FROM life_plans
          WHERE user_id = ? AND is_active = 1
        )
      ORDER BY plan_type, order_num
    `).all(req.user.user_id, req.user.user_id);

    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: null,
        message: '尚未生成方案，请先完成风险预测或直接生成方案'
      });
    }

    const planId = rows[0].plan_id;
    const dietPlans = rows.filter(r => r.plan_type === 'diet');
    const exercisePlans = rows.filter(r => r.plan_type === 'exercise');
    const otherPlans = rows.filter(r => r.plan_type === 'other');
    const generatedAt = rows[0].created_at;

    success(res, {
      plan_id: planId,
      diet_plans: dietPlans,
      exercise_plans: exercisePlans,
      other_plans: otherPlans || [],
      generated_at: generatedAt
    }, '查询成功');
  } catch (e) {
    next(e);
  }
});

router.put('/adjust', authMiddleware, async (req, res, next) => {
  try {
    const err = validatePlanAdjust(req.body);
    if (err) throw new AppError(422, 'VALIDATION_ERROR', err);

    const latest = db.prepare(`
      SELECT age, gender, height, weight
      FROM user_risk_info WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(req.user.user_id);
    if (!latest) throw new AppError(422, 'VALIDATION_ERROR', '请先完成风险预测或提供健康信息');

    const healthInfo = {
      age: latest.age,
      gender: latest.gender,
      height: latest.height,
      weight: latest.weight
    };

    const difyResponse = await callWorkflowBlocking(
      process.env.DIFY_PLAN_WORKFLOW_KEY,
      {
        health_info: healthInfo,
        preferences: {},
        feedback: req.body.feedback
      },
      'plan'
    );

    const { items } = await parsePlanOutput(
      difyResponse.data.outputs.text,
      process.env.DIFY_PLAN_WORKFLOW_KEY,
      callWorkflowBlocking,
      { health_info: healthInfo, preferences: {}, feedback: req.body.feedback }
    );

    const maxId = db.transaction(() => {
      db.prepare(`
        UPDATE life_plans SET is_active = 0, updated_at = datetime('now','localtime')
        WHERE user_id = ? AND plan_id = ?
      `).run(req.user.user_id, req.body.plan_id);

      const { maxId: nextId } = db.prepare(`
        SELECT COALESCE(MAX(plan_id), 0) + 1 AS maxId
        FROM life_plans WHERE user_id = ?
      `).get(req.user.user_id);

      const insertStmt = db.prepare(`
        INSERT INTO life_plans (user_id, plan_id, plan_type, order_num, time_desc, title, content, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);
      for (const item of items) {
        insertStmt.run(
          req.user.user_id,
          nextId,
          item.plan_type,
          item.order_num,
          item.time_desc || '',
          item.title,
          item.content
        );
      }

      return nextId;
    })();

    const planRows = db.prepare(`
      SELECT id, plan_type, order_num, time_desc, title, content
      FROM life_plans
      WHERE user_id = ? AND plan_id = ? AND is_active = 1
      ORDER BY plan_type, order_num
    `).all(req.user.user_id, maxId);

    success(res, {
      plan_id: maxId,
      diet_plans: planRows.filter(r => r.plan_type === 'diet'),
      exercise_plans: planRows.filter(r => r.plan_type === 'exercise'),
      other_plans: planRows.filter(r => r.plan_type === 'other') || []
    }, '方案调整成功');
  } catch (e) {
    next(e);
  }
});

module.exports = router;
