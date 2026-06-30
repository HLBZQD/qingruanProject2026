const http = require('http');
const https = require('https');

function proxyDifySSE({ apiKey, query, conversationId, userId, res, req }) {
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

  const url = baseUrl.replace(/\/$/, '') + '/v1/chat-messages';

  const body = {
    query,
    user: `user-${userId}`,
    inputs: {},
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
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        res.write(line + '\n');
      }
    });

    upstreamRes.on('end', () => {
      if (buffer.length > 0) {
        res.write(buffer + '\n');
      }
      res.end();
    });
  });

  upstreamReq.on('timeout', () => {
    if (aborted || res.writableEnded) return;
    writeErrorEvent('AI 服务响应超时，请稍后重试', 'UPSTREAM_ERROR');
  });

  upstreamReq.on('error', () => {
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

module.exports = proxyDifySSE;
