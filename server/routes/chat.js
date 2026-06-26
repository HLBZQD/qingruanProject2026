const express = require('express');
const { db } = require('../db/database');
const authMiddleware = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const proxyDifySSE = require('../services/sseProxy');
const { decryptChatToken } = require('../utils/encryption');
const { callDifyGetConversations } = require('../services/difyService');

const router = express.Router();

router.post('/doctor/:id', authMiddleware, (req, res, next) => {
  try {
    const { message, conversation_id } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(422).json({
        error: { code: 'VALIDATION_ERROR', message: '消息不能为空' }
      });
    }

    const row = db.prepare('SELECT id, chat_token FROM doctor_information WHERE id = ?').get(req.params.id);
    if (!row) throw new AppError(404, 'NOT_FOUND', '医生不存在');
    if (!row.chat_token) throw new AppError(502, 'DIFY_ERROR', '医生未配置对话服务');

    const decryptedToken = decryptChatToken(row.chat_token);

    proxyDifySSE({
      apiKey: decryptedToken,
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

router.get('/doctor/:id/conversations', authMiddleware, async (req, res, next) => {
  try {
    const row = db.prepare('SELECT id, chat_token FROM doctor_information WHERE id = ?').get(req.params.id);
    if (!row) throw new AppError(404, 'NOT_FOUND', '医生不存在');
    if (!row.chat_token) throw new AppError(502, 'DIFY_ERROR', '医生未配置对话服务');

    const decryptedToken = decryptChatToken(row.chat_token);
    const conversations = await callDifyGetConversations(decryptedToken, req.user.user_id);

    res.json({ success: true, message: '查询成功', data: conversations });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
