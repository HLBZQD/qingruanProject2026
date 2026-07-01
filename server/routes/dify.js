const express = require('express');
const http = require('http');
const https = require('https');
const authMiddleware = require('../middleware/auth');
const { getAdapter } = require('../db/database');

const AGENT_KEYS = {
  'diabetes-assistant-agent': 'DIFY_ASSISTANT_APP_KEY',
  'admin-manager-agent': 'DIFY_ADMIN_AGENT_KEY'
};

function proxyAgentSSE({ apiKey, query, conversationId, userId, inputs, res, req }) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const baseUrl = process.env.DIFY_API_BASE;

  if (!baseUrl) {
    const mockConvId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const mockMessage = JSON.stringify({ event: 'message', answer: '您好，我是AI助手（Mock模式）。Dify服务未配置。', conversation_id: mockConvId });
    const mockEnd = JSON.stringify({ event: 'message_end', conversation_id: mockConvId, message_id: `mock-msg-${Date.now()}` });
    res.write(`data: ${mockMessage}\n`);
    res.write(`data: ${mockEnd}\n`);
    res.end();
    return;
  }

  const url = baseUrl.replace(/\/$/, '') + '/chat-messages';

  const body = {
    query,
    user: String(userId),
    inputs: inputs || {},
    response_mode: 'streaming'
  };
  if (conversationId) {
    body.conversation_id = conversationId;
  }

  const parsedUrl = new URL(url);
  const mod = parsedUrl.protocol === 'https:' ? https : http;

  const upstreamReqOptions = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 120000
  };

  let aborted = false;

  function writeErrorEvent(message, code) {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify({ event: 'error', message, code })}\n`);
    res.end();
  }

  const upstreamReq = mod.request(upstreamReqOptions, (upstreamRes) => {
    if (upstreamRes.statusCode < 200 || upstreamRes.statusCode >= 300) {
      let errorBody = '';
      upstreamRes.on('data', (chunk) => { errorBody += chunk.toString(); });
      upstreamRes.on('end', () => {
        let message = 'AI 服务返回错误';
        try {
          const parsed = JSON.parse(errorBody);
          message = parsed.message || message;
        } catch (e) { /* use default message */ }
        writeErrorEvent(message, 'DIFY_ERROR');
      });
      return;
    }

    let buffer = '';
    upstreamRes.on('data', (chunk) => {
      if (aborted || res.writableEnded) return;
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        res.write(line + '\n');
      }
    });

    upstreamRes.on('end', () => {
      if (aborted || res.writableEnded) return;
      if (buffer.length > 0) {
        res.write(buffer + '\n');
      }
      res.end();
    });
  });

  upstreamReq.on('timeout', () => {
    console.error('[dify] 上游请求超时:', url);
    if (aborted || res.writableEnded) return;
    writeErrorEvent('AI 服务响应超时，请稍后重试', 'UPSTREAM_ERROR');
  });

  upstreamReq.on('error', (err) => {
    console.error('[dify] 上游连接错误:', url, err.message);
    if (aborted || res.writableEnded) return;
    writeErrorEvent('AI 服务连接失败，请稍后重试', 'UPSTREAM_ERROR');
  });

  req.on('close', () => {
    aborted = true;
    if (upstreamReq && !upstreamReq.destroyed) {
      upstreamReq.destroy();
    }
  });

  upstreamReq.write(JSON.stringify(body));
  upstreamReq.end();
}

const router = express.Router();

router.post('/agent/:agent_id', authMiddleware, async (req, res, next) => {
  try {
    const envKey = AGENT_KEYS[req.params.agent_id];
    if (!envKey) {
      return res.status(400).json({
        error: { code: 'INVALID_AGENT', message: '未知的 Agent 标识' }
      });
    }
    const apiKey = process.env[envKey];

    const { message, conversation_id } = req.body || {};
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(422).json({
        error: { code: 'VALIDATION_ERROR', message: '消息不能为空' }
      });
    }

    // 查询用户风险信息，填充 Dify Agent 的 Input Form 必填字段
    // 查询失败或用户无风险信息时，inputs 为空 → Dify 使用默认值
    const inputs = {};
    try {
      const adapter = getAdapter();
      const riskRows = await adapter.query(
        'SELECT age, gender, height, weight, family_history, waist, systolic_bp, diabetes_history FROM user_risk_info WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
        [req.user.user_id]
      );

      if (riskRows.length > 0) {
        const r = riskRows[0];
        inputs.userId = String(req.user.user_id);
        inputs.sex = r.gender || '';
        inputs.age = r.age != null ? String(r.age) : '';
        inputs.height = r.height != null ? String(r.height) : '';
        inputs.weight = r.weight != null ? String(r.weight) : '';
        inputs.familyHistory = r.family_history || 'no';
        inputs.waistCircumference = r.waist != null ? String(r.waist) : '';
        inputs.bloodPressure = r.systolic_bp != null ? String(r.systolic_bp) : '';
        inputs.disease = r.diabetes_history || 'healthy';
      }
    } catch (dbErr) {
      console.error('[dify] 查询用户风险信息失败:', dbErr.message);
      // inputs 保持为空，不阻断对话流程
    }

    proxyAgentSSE({
      apiKey,
      query: message,
      conversationId: conversation_id,
      userId: req.user.user_id,
      inputs,
      res,
      req
    });
  } catch (e) {
    next(e);
  }
});

router.proxyAgentSSE = proxyAgentSSE;
router.AGENT_KEYS = AGENT_KEYS;

module.exports = router;
