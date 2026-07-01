// Vitest globals（describe/it/expect/vi/beforeEach/afterEach）已通过 vitest.config.ts 的 globals:true 注入，
// 后端 .js 文件无需、也不能 require('vitest')。
const { EventEmitter } = require('events')
const http = require('http')
const https = require('https')

// ────────────────────────────────────────────────────────────
// 共享 Mock 对象（patch http.request / https.request 后使用）
// ────────────────────────────────────────────────────────────
const mockReq = new EventEmitter()
const mockRes = new EventEmitter()
mockReq.setMaxListeners(100)
mockRes.setMaxListeners(100)

/**
 * 启动 mock：用 vi.fn() 替换 http.request 和 https.request。
 * sseProxy.js 通过 require 获取的是同一份缓存的 http/https 对象，
 * 所以在 patch 后清除 require 缓存再重新加载即可生效。
 */
function installMocks() {
  mockReq.destroyed = false
  mockRes.statusCode = 200
  mockReq._opts = null
  mockReq._body = ''
  mockReq.removeAllListeners()
  mockRes.removeAllListeners()

  // 给 mockReq 挂必要的 writable stream 方法（sseProxy 会调用 write/end/destroy）
  mockReq.write = (chunk) => { mockReq._body += chunk.toString(); return true }
  mockReq.end = vi.fn()
  mockReq.destroy = vi.fn(() => { mockReq.destroyed = true })

  // 给 mockReq 挂一个 noop error 监听，防止 emit('error') 时 Node.js 抛未处理异常
  mockReq.on('error', () => {})

  vi.spyOn(http, 'request').mockImplementation((opts, cb) => {
    mockReq._opts = opts
    mockReq._body = ''
    setImmediate(() => cb(mockRes))
    return mockReq
  })

  vi.spyOn(https, 'request').mockImplementation((opts, cb) => {
    mockReq._opts = opts
    mockReq._body = ''
    setImmediate(() => cb(mockRes))
    return mockReq
  })
}

/** 加载 sseProxy（清除缓存以获取打了 patch 的 http/https） */
function loadSseProxy() {
  const modPath = require.resolve('../../server/services/sseProxy')
  delete require.cache[modPath]
  return require('../../server/services/sseProxy')
}

// ────────────────────────────────────────────────────────────
// 辅助函数
// ────────────────────────────────────────────────────────────

/**
 * 创建模拟的 Express Response 对象。
 * 捕获 write 调用到 _chunks，end 调用设置 writableEnded = true。
 */
function makeRes() {
  const r = { writableEnded: false, _chunks: [] }
  r.setHeader = vi.fn()
  r.write = vi.fn((data) => { r._chunks.push(data); return true })
  r.end = vi.fn(() => { r.writableEnded = true })
  return r
}

/**
 * 创建模拟的 Express Request 对象（EventEmitter，用于监听 'close' 事件）。
 */
function makeReq() {
  return new EventEmitter()
}

/** 等待下一个 tick，使 setImmediate 中的回调得以执行 */
function nextTick() {
  return new Promise((resolve) => setImmediate(resolve))
}

/** 设置 DIFY_API_BASE 环境变量 */
function setBaseUrl(url) {
  process.env.DIFY_API_BASE = url
}

// ────────────────────────────────────────────────────────────
// 测试套件
// ────────────────────────────────────────────────────────────

describe('proxyDifySSE', () => {
  let proxyDifySSE

  beforeEach(() => {
    installMocks()
    proxyDifySSE = loadSseProxy()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.DIFY_API_BASE
    mockReq.removeAllListeners()
    mockRes.removeAllListeners()
  })

  // ── Mock 模式：DIFY_API_BASE 未配置 ──
  describe('Mock 模式（DIFY_API_BASE 未配置）', () => {
    it('返回 Mock SSE 消息，写入以 data: 开头的 message 事件', () => {
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      const allData = res._chunks.join('')
      expect(allData).toContain('data: ')
      expect(allData).toContain('"event":"message"')
      expect(allData).toContain('Mock模式')
    })

    it('返回 Mock message_end 事件', () => {
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      const allData = res._chunks.join('')
      expect(allData).toContain('"event":"message_end"')
    })

    it('Mock 模式下不发起 HTTP 请求', () => {
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(http.request).not.toHaveBeenCalled()
    })

    it('Mock 模式下调用 res.end() 结束响应', () => {
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(res.end).toHaveBeenCalled()
    })
  })

  // ── SSE 响应头 ──
  describe('SSE 响应头设置', () => {
    it('设置 Content-Type 为 text/event-stream', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
    })

    it('设置 Cache-Control 为 no-cache', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache')
    })

    it('设置 Connection 为 keep-alive', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive')
    })

    it('设置 X-Accel-Buffering 为 no', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no')
    })

    it('Mock 模式下同样设置 SSE 响应头', () => {
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
    })
  })

  // ── URL 构造（双 /v1 修复验证） ──
  describe('URL 构造（修复验证：不再出现 /v1/v1/）', () => {
    it('DIFY_API_BASE 含 /v1 后缀时，请求路径为 /v1/chat-messages', () => {
      setBaseUrl('http://dify.example.com:56487/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(mockReq._opts.path).toBe('/v1/chat-messages')
    })

    it('请求路径不包含双 /v1（回归验证）', () => {
      setBaseUrl('http://dify.example.com:56487/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '测试', userId: 1, res, req })

      expect(mockReq._opts.path).not.toMatch(/\/v1\/v1/)
    })

    it('DIFY_API_BASE 尾部带斜杠时正确去除', () => {
      setBaseUrl('http://dify.example.com/v1/')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(mockReq._opts.path).toBe('/v1/chat-messages')
    })

    it('hostname 从 DIFY_API_BASE 正确解析', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(mockReq._opts.hostname).toBe('dify.example.com')
    })

    it('port 从 DIFY_API_BASE 正确解析', () => {
      setBaseUrl('http://dify.example.com:56487/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(mockReq._opts.port).toBe('56487')
    })
  })

  // ── 请求体构造 ──
  describe('请求体构造', () => {
    it('query 字段正确传递用户消息', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '今天血糖多少？', userId: 1, res, req })

      const body = JSON.parse(mockReq._body)
      expect(body.query).toBe('今天血糖多少？')
    })

    it('user 字段格式为 user-{userId}', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 42, res, req })

      const body = JSON.parse(mockReq._body)
      expect(body.user).toBe('user-42')
    })

    it('userId 为字符串时 user 字段为 user-{userId}（保留现有行为）', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: '42', res, req })

      const body = JSON.parse(mockReq._body)
      expect(body.user).toBe('user-42')
    })

    it('response_mode 为 streaming', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      const body = JSON.parse(mockReq._body)
      expect(body.response_mode).toBe('streaming')
    })

    it('inputs 为空对象', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      const body = JSON.parse(mockReq._body)
      expect(body.inputs).toEqual({})
    })

    it('传入 conversationId 时包含 conversation_id 字段', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({
        apiKey: 'app-xxx', query: '继续', conversationId: 'conv-abc-123', userId: 1, res, req
      })

      const body = JSON.parse(mockReq._body)
      expect(body.conversation_id).toBe('conv-abc-123')
    })

    it('未传入 conversationId 时请求体不包含 conversation_id', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      const body = JSON.parse(mockReq._body)
      expect(body).not.toHaveProperty('conversation_id')
    })

    it('conversationId 为 undefined 时不包含 conversation_id', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({
        apiKey: 'app-xxx', query: '你好', conversationId: undefined, userId: 1, res, req
      })

      const body = JSON.parse(mockReq._body)
      expect(body).not.toHaveProperty('conversation_id')
    })
  })

  // ── Authorization 请求头 ──
  describe('Authorization 请求头', () => {
    it('使用 Bearer 令牌格式传递 apiKey', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-test-key-123', query: '你好', userId: 1, res, req })

      expect(mockReq._opts.headers['Authorization']).toBe('Bearer app-test-key-123')
    })

    it('Content-Type 设置为 application/json', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(mockReq._opts.headers['Content-Type']).toBe('application/json')
    })
  })

  // ── 上游成功响应 — SSE 流式透传 ──
  describe('上游成功响应（SSE 流式透传）', () => {
    it('将上游 SSE 数据逐行转发到客户端', async () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      // 触发异步回调，开始处理上游响应
      await nextTick()

      // 模拟上游逐行返回 SSE 数据
      mockRes.emit('data', Buffer.from('data: {"event":"message","answer":"你好"}\n'))
      mockRes.emit('data', Buffer.from('\n'))

      expect(res._chunks.some(c => c.includes('"event":"message"'))).toBe(true)
    })

    it('上游结束时调用 res.end()', async () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()

      mockRes.emit('end')

      expect(res.end).toHaveBeenCalled()
    })

    it('上游结束时刷新缓冲区剩余数据', async () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()

      // 发送一个不完整的行（无尾随换行符）
      mockRes.emit('data', Buffer.from('incomplete-line'))
      mockRes.emit('end')

      // 缓冲区剩余数据在 end 事件中被写入
      const allChunks = res._chunks.join('')
      expect(allChunks).toContain('incomplete-line')
    })

    it('跨 chunk 拆分时正确重组行', async () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()

      // 模拟跨 chunk 拆分的行
      mockRes.emit('data', Buffer.from('data: {"event":"m'))
      mockRes.emit('data', Buffer.from('essage","answer":"ok"}\n'))
      mockRes.emit('data', Buffer.from('\n'))

      const allChunks = res._chunks.join('')
      expect(allChunks).toContain('"event":"message"')
    })
  })

  // ── 上游错误响应（非 2xx） ──
  describe('上游错误响应（非 2xx）', () => {
    it('上游返回 400 时写入 error 事件', async () => {
      setBaseUrl('http://dify.example.com/v1')
      mockRes.statusCode = 400
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()
      // 400 分支不注册 data 回调，而是读取错误体
      mockRes.emit('data', Buffer.from(JSON.stringify({ message: '查询参数无效' })))
      mockRes.emit('end')

      const allChunks = res._chunks.join('')
      expect(allChunks).toContain('"event":"error"')
      expect(allChunks).toContain('"code":"DIFY_ERROR"')
    })

    it('上游返回 500 时写入 error 事件', async () => {
      setBaseUrl('http://dify.example.com/v1')
      mockRes.statusCode = 500
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()
      mockRes.emit('data', Buffer.from(JSON.stringify({ message: '内部服务错误' })))
      mockRes.emit('end')

      const allChunks = res._chunks.join('')
      expect(allChunks).toContain('"event":"error"')
      expect(allChunks).toContain('"code":"DIFY_ERROR"')
      expect(allChunks).toContain('内部服务错误')
    })

    it('错误体非 JSON 时使用默认错误消息', async () => {
      setBaseUrl('http://dify.example.com/v1')
      mockRes.statusCode = 502
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()
      mockRes.emit('data', Buffer.from('plain text error'))
      mockRes.emit('end')

      const allChunks = res._chunks.join('')
      expect(allChunks).toContain('AI 服务返回错误')
    })

    it('错误事件后调用 res.end()', async () => {
      setBaseUrl('http://dify.example.com/v1')
      mockRes.statusCode = 400
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()
      mockRes.emit('data', Buffer.from(JSON.stringify({ message: 'err' })))
      mockRes.emit('end')

      expect(res.end).toHaveBeenCalled()
    })
  })

  // ── 上游超时处理 ──
  describe('上游超时处理', () => {
    beforeEach(() => {
      // 清除 installMocks 中加入的 noop error 监听器，
      // 使超时 handler 被 proxyDifySSE 注册（不会重复）。
    })

    it('超时时写入 UPSTREAM_ERROR 事件', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      mockReq.emit('timeout')

      const allChunks = res._chunks.join('')
      expect(allChunks).toContain('"event":"error"')
      expect(allChunks).toContain('"code":"UPSTREAM_ERROR"')
    })

    it('超时时调用 res.end()', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      mockReq.emit('timeout')

      expect(res.end).toHaveBeenCalled()
    })

    it('已断开（aborted）时不写入超时错误', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      // 模拟客户端断开
      req.emit('close')
      // 此时 aborted 应为 true
      mockReq.emit('timeout')

      // 不应产生新的 write 调用（close 后 timeout 被守卫拦截）
      const errorChunks = res._chunks.filter(c => c.includes('UPSTREAM_ERROR'))
      expect(errorChunks.length).toBe(0)
    })
  })

  // ── 上游连接错误 ──
  describe('上游连接错误处理', () => {
    it('连接错误时写入 UPSTREAM_ERROR 事件', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      mockReq.emit('error', new Error('ECONNREFUSED'))

      const allChunks = res._chunks.join('')
      expect(allChunks).toContain('"event":"error"')
      expect(allChunks).toContain('"code":"UPSTREAM_ERROR"')
    })

    it('连接错误后调用 res.end()', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      mockReq.emit('error', new Error('ENOTFOUND'))

      expect(res.end).toHaveBeenCalled()
    })

    it('已断开（aborted）时不写入连接错误', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      req.emit('close')
      mockReq.emit('error', new Error('ECONNRESET'))

      const errorChunks = res._chunks.filter(c => c.includes('UPSTREAM_ERROR'))
      expect(errorChunks.length).toBe(0)
    })
  })

  // ── 客户端断开处理 ──
  describe('客户端断开处理', () => {
    it('客户端 close 事件触发 upstreamReq.destroy()', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      req.emit('close')

      // mockReq.destroyed 在 mockImplementation 中被设置为 true
      expect(mockReq.destroyed).toBe(true)
    })
  })

  // ── 防御性守卫（aborted / writableEnded） ──
  describe('防御性守卫', () => {
    it('res.writableEnded 为 true 时不再写入 data', async () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()
      // 模拟 res 已结束
      res.writableEnded = true

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()

      mockRes.emit('data', Buffer.from('should-be-ignored\n'))

      const dataAfterEnd = res._chunks.filter(c => c.includes('should-be-ignored'))
      expect(dataAfterEnd.length).toBe(0)
    })

    it('客户端断开后不再写入上游 data', async () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()

      // 模拟客户端断开
      req.emit('close')

      // 上游继续发送数据
      mockRes.emit('data', Buffer.from('late-data-should-be-ignored\n'))

      const lateData = res._chunks.filter(c => c.includes('late-data-should-be-ignored'))
      expect(lateData.length).toBe(0)
    })

    it('res.writableEnded 为 true 时 end 处理器不重复调用 res.end()', async () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()
      res.writableEnded = true

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()

      mockRes.emit('end')

      // end 不应被再次调用（因为 writableEnded 已为 true）
      expect(res.end).not.toHaveBeenCalled()
    })

    it('客户端断开后上游 end 不再调用 res.end()', async () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()

      req.emit('close')
      // 清除 close 之前的 end 调用记录
      res.end.mockClear()

      mockRes.emit('end')

      expect(res.end).not.toHaveBeenCalled()
    })
  })

  // ── HTTP 方法 ──
  describe('HTTP 方法', () => {
    it('向上游发起 POST 请求', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(mockReq._opts.method).toBe('POST')
    })
  })

  // ── 请求超时配置 ──
  describe('请求超时配置', () => {
    it('设置上游请求超时为 120000ms（120秒）', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(mockReq._opts.timeout).toBe(120000)
    })
  })

  // ── 行为契约：不变式验证 ──
  describe('行为不变式', () => {
    it('user 字段始终为 user-{userId} 格式（不影响 chat/admin 路由）', () => {
      setBaseUrl('http://dify.example.com/v1')
      const items = [
        { apiKey: 'key-assistant', userId: 100, desc: 'assistant 路由' },
        { apiKey: 'key-doctor', userId: 200, desc: 'chat/doctor 路由' },
        { apiKey: 'key-admin', userId: 300, desc: 'admin 路由' },
      ]

      for (const item of items) {
        const res = makeRes()
        const req = makeReq()

        proxyDifySSE({ apiKey: item.apiKey, query: '测试', userId: item.userId, res, req })
        const body = JSON.parse(mockReq._body)
        expect(body.user).toBe(`user-${item.userId}`)
      }
    })

    it('请求体不包含意外的附加字段', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      proxyDifySSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      const body = JSON.parse(mockReq._body)
      const allowedKeys = ['query', 'user', 'inputs', 'response_mode', 'conversation_id']
      const actualKeys = Object.keys(body)
      for (const key of actualKeys) {
        expect(allowedKeys).toContain(key)
      }
    })
  })
})
