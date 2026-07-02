const http = require('http');
const https = require('https');

function proxyDifySSE({ apiKey, query, conversationId, userId, res, req }) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(':ok\n\n');

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

  const bodyObj = {
    query,
    user: String(userId),
    inputs: {},
    response_mode: 'streaming'
  };
  if (conversationId) {
    bodyObj.conversation_id = conversationId;
  }

  const bodyStr = JSON.stringify(bodyObj);
  const parsedUrl = new URL(url);
  const mod = parsedUrl.protocol === 'https:' ? https : http;

  const upstreamReq = mod.request(
    parsedUrl.port
      ? { hostname: parsedUrl.hostname, port: parsedUrl.port, path: parsedUrl.pathname + parsedUrl.search, method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) },
          timeout: 120000 }
      : url,
    (upstreamRes) => {
      let buffer = '';
      upstreamRes.on('data', (chunk) => {
        if (res.writableEnded) return;
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          res.write(line + '\n');
        }
      });
      upstreamRes.on('end', () => {
        if (res.writableEnded) return;
        if (buffer.length > 0) res.write(buffer + '\n');
        res.end();
      });
    }
  );

  upstreamReq.on('timeout', () => {
    console.error('[sseProxy] 上游请求超时:', url);
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify({ event: 'error', message: 'AI 服务响应超时，请稍后重试', code: 'UPSTREAM_ERROR' })}\n`);
    res.end();
  });

  upstreamReq.on('error', (err) => {
    console.error('[sseProxy] 上游连接错误:', url, err.message);
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify({ event: 'error', message: 'AI 服务连接失败，请稍后重试', code: 'UPSTREAM_ERROR' })}\n`);
    res.end();
  });

  req.on('close', () => {
    console.log('[sseProxy] 客户端连接关闭');
  });

  upstreamReq.write(bodyStr);
  upstreamReq.end();
}

module.exports = proxyDifySSE;
