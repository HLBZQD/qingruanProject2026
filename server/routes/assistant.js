const express = require('express');
const { getAdapter } = require('../db/database');
const authMiddleware = require('../middleware/auth');
const { parsePagination, buildPagination } = require('../utils/pagination');
const proxyDifySSE = require('../services/sseProxy');
const { callDifyGetConversations } = require('../services/difyService');

const router = express.Router();

router.post('/chat', authMiddleware, (req, res, next) => {
  try {
    const { message, conversation_id } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(422).json({
        error: { code: 'VALIDATION_ERROR', message: '消息不能为空' }
      });
    }

    proxyDifySSE({
      apiKey: process.env.DIFY_ASSISTANT_APP_KEY,
      query: message,
      conversationId: conversation_id,
      userId: req.user.user_id,
      res,
      req
    });
  } catch (e) {
    next(e);
  }
});

router.get('/advice', authMiddleware, async (req, res, next) => {
  try {
    const adapter = getAdapter();
    const { page, pageSize, offset, limit } = parsePagination(req.query);

    const rows = await adapter.query(
      'SELECT id, title, tags, content, created_at FROM life_advice WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [req.user.user_id, limit, offset]
    );

    const countRows = await adapter.query(
      'SELECT COUNT(*) AS total FROM life_advice WHERE user_id = ?',
      [req.user.user_id]
    );
    const total = countRows[0].total;

    const data = rows.map((row) => {
      let tags = [];
      try {
        tags = JSON.parse(row.tags);
        if (!Array.isArray(tags)) tags = [];
      } catch (e) {
        /* tags stays [] */
      }
      return { ...row, tags };
    });

    const pagination = buildPagination(page, pageSize, total);

    res.json({ success: true, message: '查询成功', data, pagination });
  } catch (e) {
    next(e);
  }
});

router.get('/conversations', authMiddleware, async (req, res, next) => {
  try {
    const conversations = await callDifyGetConversations(
      process.env.DIFY_ASSISTANT_APP_KEY,
      req.user.user_id
    );
    res.json({ success: true, message: '查询成功', data: conversations });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
