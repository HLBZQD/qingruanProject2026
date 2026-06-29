const express = require('express');
const { getAdapter } = require('../db/database');
const sql = require('../db/sql');
const { success, AppError } = require('../utils/response');
const { validatePlanGenerate, validatePlanAdjust } = require('../utils/validators');
const { callWorkflowBlocking } = require('../services/difyService');
const { parsePlanOutput } = require('../utils/planParser');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.post('/generate', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const validationError = validatePlanGenerate(req.body);
    if (validationError) throw new AppError(422, 'VALIDATION_ERROR', validationError);

    const difyResponse = await callWorkflowBlocking(
      process.env.DIFY_PLAN_WORKFLOW_KEY,
      { health_info: req.body.health_info, preferences: req.body.preferences },
      'plan'
    );

    const outputsText = difyResponse.data.outputs.text;
    let planItems;
    try {
      planItems = JSON.parse(outputsText);
    } catch (e) {
      planItems = parsePlanOutput(outputsText);
    }
    if (!planItems || !Array.isArray(planItems)) {
      throw new AppError(502, 'PLAN_PARSE_ERROR', '方案生成成功但解析失败，请重试');
    }

    // 事务内：停用旧方案 + 生成新 plan_id + 批量插入
    const planData = await adapter.transaction(async (tx) => {
      await tx.execute(
        `UPDATE life_plans SET is_active = 0, updated_at = ${sql.now()} WHERE user_id = ? AND is_active = 1`,
        [req.user.user_id]
      );

      const rows = await tx.query(
        'SELECT COALESCE(MAX(plan_id), 0) + 1 AS maxId FROM life_plans WHERE user_id = ?',
        [req.user.user_id]
      );
      const planId = rows[0].maxId;

      for (const item of planItems) {
        await tx.execute(
          `INSERT INTO life_plans (user_id, plan_id, plan_type, order_num, time_desc, title, content, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ${sql.now()}, ${sql.now()})`,
          [req.user.user_id, planId, item.plan_type, item.order_num, item.time_desc || '', item.title, item.content]
        );
      }

      return { planId };
    });

    // 事务外查询新方案
    const newPlans = await adapter.query(
      'SELECT id, plan_id, plan_type, order_num, time_desc, title, content, is_active, created_at FROM life_plans WHERE user_id = ? AND plan_id = ? AND is_active = 1 ORDER BY order_num',
      [req.user.user_id, planData.planId]
    );

    success(res, { plan_id: planData.planId, items: newPlans }, '方案生成成功', 200);
  } catch (e) {
    next(e);
  }
});

router.get('/current', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const rows = await adapter.query(
      'SELECT id, plan_id, plan_type, order_num, time_desc, title, content, is_active, created_at FROM life_plans WHERE user_id = ? AND is_active = 1 AND plan_id = (SELECT MAX(plan_id) FROM life_plans WHERE user_id = ? AND is_active = 1) ORDER BY order_num',
      [req.user.user_id, req.user.user_id]
    );
    success(res, rows, '查询成功', 200);
  } catch (e) {
    next(e);
  }
});

router.put('/adjust', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const validationError = validatePlanAdjust(req.body);
    if (validationError) throw new AppError(422, 'VALIDATION_ERROR', validationError);

    const healthRow = await adapter.queryOne(
      'SELECT age, gender, height, weight FROM user_risk_info WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.user_id]
    );

    const difyResponse = await callWorkflowBlocking(
      process.env.DIFY_PLAN_WORKFLOW_KEY,
      {
        health_info: {
          age: healthRow ? healthRow.age : 30,
          gender: healthRow ? healthRow.gender : 'male',
          height: healthRow ? healthRow.height : 170,
          weight: healthRow ? healthRow.weight : 65
        },
        feedback: req.body.feedback
      },
      'plan'
    );

    const outputsText = difyResponse.data.outputs.text;
    let planItems;
    try {
      planItems = JSON.parse(outputsText);
    } catch (e) {
      planItems = parsePlanOutput(outputsText);
    }
    if (!planItems || !Array.isArray(planItems)) {
      throw new AppError(502, 'PLAN_PARSE_ERROR', '方案调整成功但解析失败，请重试');
    }

    const planData = await adapter.transaction(async (tx) => {
      await tx.execute(
        `UPDATE life_plans SET is_active = 0, updated_at = ${sql.now()} WHERE user_id = ? AND plan_id = ?`,
        [req.user.user_id, req.body.plan_id]
      );

      const rows = await tx.query(
        'SELECT COALESCE(MAX(plan_id), 0) + 1 AS maxId FROM life_plans WHERE user_id = ?',
        [req.user.user_id]
      );
      const planId = rows[0].maxId;

      for (const item of planItems) {
        await tx.execute(
          `INSERT INTO life_plans (user_id, plan_id, plan_type, order_num, time_desc, title, content, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ${sql.now()}, ${sql.now()})`,
          [req.user.user_id, planId, item.plan_type, item.order_num, item.time_desc || '', item.title, item.content]
        );
      }

      return { planId };
    });

    const newPlans = await adapter.query(
      'SELECT id, plan_id, plan_type, order_num, time_desc, title, content, is_active, created_at FROM life_plans WHERE user_id = ? AND plan_id = ? AND is_active = 1 ORDER BY order_num',
      [req.user.user_id, planData.planId]
    );

    success(res, { plan_id: planData.planId, items: newPlans }, '方案调整成功', 200);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
