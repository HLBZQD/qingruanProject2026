// Vitest globals（describe/it/expect/vi/beforeEach/afterEach）已通过 vitest.config.ts 的 globals:true 注入，
// 后端 .js 文件无需、也不能 require('vitest')。
const { EventEmitter } = require('events')
const http = require('http')
const https = require('https')
const request = require('supertest')
const express = require('express')

// ────────────────────────────────────────────────────────────
// 共享 Mock 对象（patch http.request / https.request 后使用）
// ────────────────────────────────────────────────────────────
const mockReq = new EventEmitter()
const mockRes = new EventEmitter()
mockReq.setMaxListeners(100)
mockRes.setMaxListeners(100)

/**
 * 启动 mock：用 vi.fn() 替换 http.request 和 https.request。
 */
function installMocks() {
  mockReq.destroyed = false
  mockRes.statusCode = 200
  mockReq._opts = null
  mockReq._body = ''
  mockReq.removeAllListeners()
  mockRes.removeAllListeners()

  mockReq.write = (chunk) => { mockReq._body += chunk.toString(); return true }
  mockReq.end = vi.fn()
  mockReq.destroy = vi.fn(() => { mockReq.destroyed = true })

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

/** Mock auth middleware：绕过 JWT 验证，直接注入测试用户 */
function mockAuth(req, res, next) {
  req.user = { user_id: 1, username: 'test', role: 'user' };
  next();
}

/** 将 mock auth 注入 require 缓存，并重新加载 dify 模块 */
function loadDifyModule() {
  const authPath = require.resolve('../../server/middleware/auth')
  const difyPath = require.resolve('../../server/routes/dify')
  delete require.cache[authPath]
  delete require.cache[difyPath]
  require.cache[authPath] = {
    id: authPath,
    path: authPath,
    filename: authPath,
    loaded: true,
    exports: mockAuth
  }
  return require('../../server/routes/dify')
}

// ────────────────────────────────────────────────────────────
// 辅助函数
// ────────────────────────────────────────────────────────────

function makeRes() {
  const r = { writableEnded: false, _chunks: [] }
  r.setHeader = vi.fn()
  r.write = vi.fn((data) => { r._chunks.push(data); return true })
  r.end = vi.fn(() => { r.writableEnded = true })
  return r
}

function makeReq() {
  return new EventEmitter()
}

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve))
}

function setBaseUrl(url) {
  process.env.DIFY_API_BASE = url
}

/** 创建独立的 Express app 实例并挂载 dify 路由器（用于 supertest 集成测试） */
function createApp() {
  // 将 mock auth 注入 require 缓存
  const authPath = require.resolve('../../server/middleware/auth')
  const difyPath = require.resolve('../../server/routes/dify')
  delete require.cache[authPath]
  delete require.cache[difyPath]
  require.cache[authPath] = {
    id: authPath,
    path: authPath,
    filename: authPath,
    loaded: true,
    exports: mockAuth
  }

  const app = express();
  app.use(express.json());
  app.use(require('../../server/routes/dify'));
  app.use((err, req, res, next) => {
    res.status(500).json({ error: { message: err.message } });
  });
  return app;
}

// ────────────────────────────────────────────────────────────
// 测试套件
// ────────────────────────────────────────────────────────────

describe('proxyAgentSSE', () => {
  let difyRouter

  beforeEach(() => {
    installMocks()
    difyRouter = loadDifyModule()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.DIFY_API_BASE
    delete process.env.DIFY_ASSISTANT_APP_KEY
    delete process.env.DIFY_ADMIN_AGENT_KEY
    mockReq.removeAllListeners()
    mockRes.removeAllListeners()
  })

  // ── 分支 (d): Mock 降级模式 ──
  describe('Mock 降级（DIFY_API_BASE 未配置）', () => {
    beforeEach(() => {
      delete process.env.DIFY_API_BASE
    })

    it('返回 Mock SSE 消息，写入以 data: 开头的 message 事件', () => {
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      const allData = res._chunks.join('')
      expect(allData).toContain('data: ')
      expect(allData).toContain('"event":"message"')
      expect(allData).toContain('Mock模式')
    })

    it('返回 Mock message_end 事件', () => {
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      const allData = res._chunks.join('')
      expect(allData).toContain('"event":"message_end"')
    })

    it('Mock 模式下不发起 HTTP 请求', () => {
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(http.request).not.toHaveBeenCalled()
    })

    it('Mock 模式下调用 res.end() 结束响应', () => {
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(res.end).toHaveBeenCalled()
    })
  })

  // ── SSE 响应头 ──
  describe('SSE 响应头设置', () => {
    it('设置 Content-Type 为 text/event-stream', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
    })

    it('设置 Cache-Control 为 no-cache', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache')
    })

    it('设置 Connection 为 keep-alive', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive')
    })

    it('设置 X-Accel-Buffering 为 no', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no')
    })
  })

  // ── URL 构造 ──
  describe('URL 构造', () => {
    it('DIFY_API_BASE 含 /v1 后缀时，请求路径为 /v1/chat-messages', () => {
      setBaseUrl('http://dify.example.com:56487/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(mockReq._opts.path).toBe('/v1/chat-messages')
    })

    it('请求路径不包含双 /v1（回归验证）', () => {
      setBaseUrl('http://dify.example.com:56487/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '测试', userId: 1, res, req })

      expect(mockReq._opts.path).not.toMatch(/\/v1\/v1/)
    })
  })

  // ── 请求体构造（含 user 字段格式差异验证）──
  describe('请求体构造', () => {
    it('query 字段正确传递用户消息', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '今天血糖多少？', userId: 1, res, req })

      const body = JSON.parse(mockReq._body)
      expect(body.query).toBe('今天血糖多少？')
    })

    it('user 字段为纯数字 String(userId)，非 user-{id} 格式', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 42, res, req })

      const body = JSON.parse(mockReq._body)
      expect(body.user).toBe('42')
    })

    it('userId 为数字类型时 user 字段为纯数字字符串', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      const body = JSON.parse(mockReq._body)
      expect(body.user).toBe('1')
      expect(body.user).not.toBe('user-1')
    })

    it('userId 为字符串类型时 user 字段不变', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: '99', res, req })

      const body = JSON.parse(mockReq._body)
      expect(body.user).toBe('99')
    })

    it('response_mode 为 streaming', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      const body = JSON.parse(mockReq._body)
      expect(body.response_mode).toBe('streaming')
    })

    it('未传入 inputs 时默认为空对象', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      const body = JSON.parse(mockReq._body)
      expect(body.inputs).toEqual({})
    })

    it('传入 inputs 时正确传递到请求体', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({
        apiKey: 'app-xxx', query: '你好', userId: 1,
        inputs: { userId: '1', sex: 'male', age: '30', disease: 'healthy' },
        res, req
      })

      const body = JSON.parse(mockReq._body)
      expect(body.inputs).toEqual({ userId: '1', sex: 'male', age: '30', disease: 'healthy' })
    })

    it('传入 conversationId 时包含 conversation_id 字段', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({
        apiKey: 'app-xxx', query: '继续', conversationId: 'conv-abc-123', userId: 1, res, req
      })

      const body = JSON.parse(mockReq._body)
      expect(body.conversation_id).toBe('conv-abc-123')
    })

    it('未传入 conversationId 时请求体不包含 conversation_id', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

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

      difyRouter.proxyAgentSSE({ apiKey: 'app-test-key-123', query: '你好', userId: 1, res, req })

      expect(mockReq._opts.headers['Authorization']).toBe('Bearer app-test-key-123')
    })

    it('Content-Type 设置为 application/json', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      expect(mockReq._opts.headers['Content-Type']).toBe('application/json')
    })
  })

  // ── 上游成功响应 — SSE 流式透传 ──
  describe('上游成功响应（SSE 流式透传）', () => {
    it('将上游 SSE 数据逐行转发到客户端', async () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      await nextTick()

      mockRes.emit('data', Buffer.from('data: {"event":"message","answer":"你好"}\n'))
      mockRes.emit('data', Buffer.from('\n'))

      expect(res._chunks.some(c => c.includes('"event":"message"'))).toBe(true)
    })

    it('上游结束时调用 res.end()', async () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()

      mockRes.emit('end')

      expect(res.end).toHaveBeenCalled()
    })
  })

  // ── 上游错误响应（非 2xx） ──
  describe('上游错误响应（非 2xx）', () => {
    it('上游返回 400 时写入 DIFY_ERROR 事件', async () => {
      setBaseUrl('http://dify.example.com/v1')
      mockRes.statusCode = 400
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()
      mockRes.emit('data', Buffer.from(JSON.stringify({ message: '查询参数无效' })))
      mockRes.emit('end')

      const allChunks = res._chunks.join('')
      expect(allChunks).toContain('"event":"error"')
      expect(allChunks).toContain('"code":"DIFY_ERROR"')
    })
  })

  // ── 上游超时处理 ──
  describe('上游超时处理', () => {
    it('超时时写入 UPSTREAM_ERROR 事件', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      mockReq.emit('timeout')

      const allChunks = res._chunks.join('')
      expect(allChunks).toContain('"event":"error"')
      expect(allChunks).toContain('"code":"UPSTREAM_ERROR"')
    })

    it('超时时调用 res.end()', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      mockReq.emit('timeout')

      expect(res.end).toHaveBeenCalled()
    })
  })

  // ── 上游连接错误 ──
  describe('上游连接错误处理', () => {
    it('连接错误时写入 UPSTREAM_ERROR 事件', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      mockReq.emit('error', new Error('ECONNREFUSED'))

      const allChunks = res._chunks.join('')
      expect(allChunks).toContain('"event":"error"')
      expect(allChunks).toContain('"code":"UPSTREAM_ERROR"')
    })
  })

  // ── 客户端断开处理 ──
  describe('客户端断开处理', () => {
    it('客户端 close 事件触发 upstreamReq.destroy()', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })

      req.emit('close')

      expect(mockReq.destroyed).toBe(true)
    })
  })

  // ── 防御性守卫（aborted / writableEnded）──
  describe('防御性守卫（aborted / writableEnded）', () => {
    it('res.writableEnded 为 true 时不再写入上游 data', async () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()
      res.writableEnded = true

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()

      mockRes.emit('data', Buffer.from('should-be-ignored\n'))

      const dataAfterEnd = res._chunks.filter(c => c.includes('should-be-ignored'))
      expect(dataAfterEnd.length).toBe(0)
    })

    it('客户端断开后不再写入上游 data', async () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()

      req.emit('close')

      mockRes.emit('data', Buffer.from('late-data-should-be-ignored\n'))

      const lateData = res._chunks.filter(c => c.includes('late-data-should-be-ignored'))
      expect(lateData.length).toBe(0)
    })

    it('res.writableEnded 为 true 时 end 处理器不重复调用 res.end()', async () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()
      res.writableEnded = true

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()

      mockRes.emit('end')

      expect(res.end).not.toHaveBeenCalled()
    })

    it('客户端断开后上游 end 不再调用 res.end()', async () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      await nextTick()

      req.emit('close')
      res.end.mockClear()

      mockRes.emit('end')

      expect(res.end).not.toHaveBeenCalled()
    })

    it('客户端断开后（aborted）不再写入超时错误', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      req.emit('close')
      mockReq.emit('timeout')

      const errorChunks = res._chunks.filter(c => c.includes('UPSTREAM_ERROR'))
      expect(errorChunks.length).toBe(0)
    })

    it('客户端断开后（aborted）不再写入连接错误', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: 'app-xxx', query: '你好', userId: 1, res, req })
      req.emit('close')
      mockReq.emit('error', new Error('ECONNRESET'))

      const errorChunks = res._chunks.filter(c => c.includes('UPSTREAM_ERROR'))
      expect(errorChunks.length).toBe(0)
    })
  })

  // ── 分支 (e): 环境变量未配置（agent_id 映射存在但 env var 为 undefined）──
  describe('环境变量未配置时的错误链', () => {
    it('apiKey 为 undefined 时仍发起 HTTP 请求（路由层不中止）', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: undefined, query: '你好', userId: 1, res, req })

      expect(http.request).toHaveBeenCalled()
    })

    it('apiKey 为 undefined 时 Authorization 头为 Bearer undefined', () => {
      setBaseUrl('http://dify.example.com/v1')
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: undefined, query: '你好', userId: 1, res, req })

      expect(mockReq._opts.headers['Authorization']).toBe('Bearer undefined')
    })

    it('上游返回 401 时写入 DIFY_ERROR 事件', async () => {
      setBaseUrl('http://dify.example.com/v1')
      mockRes.statusCode = 401
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: undefined, query: '你好', userId: 1, res, req })
      await nextTick()
      mockRes.emit('data', Buffer.from(JSON.stringify({ message: 'Invalid token' })))
      mockRes.emit('end')

      const allChunks = res._chunks.join('')
      expect(allChunks).toContain('"event":"error"')
      expect(allChunks).toContain('"code":"DIFY_ERROR"')
    })

    it('上游 401 后调用 res.end()', async () => {
      setBaseUrl('http://dify.example.com/v1')
      mockRes.statusCode = 401
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: undefined, query: '你好', userId: 1, res, req })
      await nextTick()
      mockRes.emit('data', Buffer.from(JSON.stringify({ message: 'Invalid token' })))
      mockRes.emit('end')

      expect(res.end).toHaveBeenCalled()
    })

    it('401 响应仍为 SSE 格式（非 JSON），与路由层校验错误区分', async () => {
      setBaseUrl('http://dify.example.com/v1')
      mockRes.statusCode = 401
      const res = makeRes()
      const req = makeReq()

      difyRouter.proxyAgentSSE({ apiKey: undefined, query: '你好', userId: 1, res, req })
      await nextTick()
      mockRes.emit('data', Buffer.from(JSON.stringify({ message: 'Invalid token' })))
      mockRes.emit('end')

      const allChunks = res._chunks.join('')
      expect(allChunks).toContain('data: ')
      expect(allChunks).toContain('"event":"error"')
    })
  })

  // ── 分支 (a): agent_id 查表 → 正确的 env var 映射 ──
  describe('agent_id 到环境变量的映射', () => {
    it('diabetes-assistant-agent 映射到 DIFY_ASSISTANT_APP_KEY', () => {
      setBaseUrl('http://dify.example.com/v1')
      process.env.DIFY_ASSISTANT_APP_KEY = 'app-diabetes-key-123'

      const envKey = difyRouter.AGENT_KEYS['diabetes-assistant-agent']
      expect(envKey).toBe('DIFY_ASSISTANT_APP_KEY')

      const res = makeRes()
      const req = makeReq()
      difyRouter.proxyAgentSSE({
        apiKey: process.env[envKey],
        query: '你好',
        userId: 1,
        res,
        req
      })

      expect(mockReq._opts.headers['Authorization']).toBe('Bearer app-diabetes-key-123')
    })

    it('admin-manager-agent 映射到 DIFY_ADMIN_AGENT_KEY', () => {
      setBaseUrl('http://dify.example.com/v1')
      process.env.DIFY_ADMIN_AGENT_KEY = 'app-admin-key-456'

      const envKey = difyRouter.AGENT_KEYS['admin-manager-agent']
      expect(envKey).toBe('DIFY_ADMIN_AGENT_KEY')

      const res = makeRes()
      const req = makeReq()
      difyRouter.proxyAgentSSE({
        apiKey: process.env[envKey],
        query: '你好',
        userId: 1,
        res,
        req
      })

      expect(mockReq._opts.headers['Authorization']).toBe('Bearer app-admin-key-456')
    })

    it('diabetes-assistant-agent 映射后直接调用 proxyAgentSSE 时 user 为纯数字', () => {
      setBaseUrl('http://dify.example.com/v1')
      process.env.DIFY_ASSISTANT_APP_KEY = 'app-key-integration'

      const envKey = difyRouter.AGENT_KEYS['diabetes-assistant-agent']
      const res = makeRes()
      const req = makeReq()
      difyRouter.proxyAgentSSE({
        apiKey: process.env[envKey],
        query: '血糖管理',
        userId: 42,
        res,
        req
      })

      const body = JSON.parse(mockReq._body)
      expect(body.user).toBe('42')
      expect(body.user).not.toBe('user-42')
    })
  })
})

// ────────────────────────────────────────────────────────────
// 路由集成测试（supertest）
// 分支 (b)(c): 错误路径不需要 mock http.request（请求在 proxyAgentSSE 之前返回）
// 分支 (a): 成功路径使用 Mock 降级模式（DIFY_API_BASE 为空），不发起 HTTP 请求
// ────────────────────────────────────────────────────────────

describe('POST /agent/:agent_id 路由校验', () => {
  let app

  beforeEach(() => {
    app = createApp()
  })

  // 已知未覆盖路径：路由处理器 try/catch → next(e) 异常传播路径。
  // 触发此路径需要构造使路由处理器内部抛出同步异常的场景（如 AGENT_KEYS 查表时
  // 抛出非预期错误），实现成本较高。Express 标准错误处理模式（next(e) → 错误处理
  // 中间件）已被框架级别验证，当前测试集侧重验证业务逻辑分支。

  // ── 分支 (b): 未知 agent_id 错误 ──
  describe('未知 agent_id 错误响应', () => {
    it('传入未知 agent_id 返回 400', async () => {
      const res = await request(app)
        .post('/agent/nonexistent-agent')
        .send({ message: '你好' })
        .expect(400)

      expect(res.body.error.code).toBe('INVALID_AGENT')
    })

    it('错误消息包含"未知的 Agent 标识"', async () => {
      const res = await request(app)
        .post('/agent/unknown-agent')
        .send({ message: '测试消息' })
        .expect(400)

      expect(res.body.error.message).toBe('未知的 Agent 标识')
    })

    it('响应为 JSON 格式（非 SSE）', async () => {
      const res = await request(app)
        .post('/agent/nonexistent')
        .send({ message: '你好' })
        .expect(400)

      expect(res.headers['content-type']).toContain('application/json')
      expect(res.body.error).toBeDefined()
    })
  })

  // ── 分支 (c): message 校验 ──
  describe('message 校验', () => {
    it('message 为空字符串返回 422', async () => {
      const res = await request(app)
        .post('/agent/diabetes-assistant-agent')
        .send({ message: '' })
        .expect(422)

      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('message 缺失返回 422', async () => {
      const res = await request(app)
        .post('/agent/diabetes-assistant-agent')
        .send({})
        .expect(422)

      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('message 为纯空白字符串返回 422', async () => {
      const res = await request(app)
        .post('/agent/diabetes-assistant-agent')
        .send({ message: '   ' })
        .expect(422)

      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('错误消息为"消息不能为空"', async () => {
      const res = await request(app)
        .post('/agent/diabetes-assistant-agent')
        .send({ message: '' })
        .expect(422)

      expect(res.body.error.message).toBe('消息不能为空')
    })

    it('响应为 JSON 格式（非 SSE）', async () => {
      const res = await request(app)
        .post('/agent/diabetes-assistant-agent')
        .send({})
        .expect(422)

      expect(res.headers['content-type']).toContain('application/json')
      expect(res.body.error).toBeDefined()
    })
  })

  // ── 分支 (a) 集成: 已知 agent_id 正常代理（路由集成）──
  // 使用 Mock 降级模式（DIFY_API_BASE 为空）触发 proxyAgentSSE 的 Mock 分支，
  // 该分支不发起 HTTP 请求，直接返回 SSE 数据。这验证了完整的 Express 路由集成：
  // auth → route handler → agent_id 查表 → message 校验 → proxyAgentSSE → SSE 响应。
  // 请求体构造细节（user 格式、Authorization 头等）由 proxyAgentSSE 直接测试覆盖。
  describe('已知 agent_id 正常代理（路由集成）', () => {
    beforeEach(() => {
      process.env.DIFY_ASSISTANT_APP_KEY = 'app-diabetes-integration';
      process.env.DIFY_ADMIN_AGENT_KEY = 'app-admin-integration';
      delete process.env.DIFY_API_BASE;
      app = createApp();
    });

    afterEach(() => {
      delete process.env.DIFY_ASSISTANT_APP_KEY;
      delete process.env.DIFY_ADMIN_AGENT_KEY;
    });

    it('diabetes-assistant-agent 路由集成：返回 SSE Mock 响应', async () => {
      const res = await request(app)
        .post('/agent/diabetes-assistant-agent')
        .send({ message: '血糖管理' });
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.headers['connection']).toBe('keep-alive');
      expect(res.text).toContain('data: ');
      expect(res.text).toContain('"event":"message"');
      expect(res.text).toContain('Mock');
      expect(res.text).toContain('"event":"message_end"');
    });

    it('admin-manager-agent 路由集成：返回 SSE Mock 响应', async () => {
      const res = await request(app)
        .post('/agent/admin-manager-agent')
        .send({ message: '系统管理' });
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('"event":"message"');
      expect(res.text).toContain('Mock');
    });

    it('路由处理器完整生命周期：查表→校验→proxyAgentSSE→SSE', async () => {
      const res = await request(app)
        .post('/agent/diabetes-assistant-agent')
        .send({ message: '测试消息' });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('data: ');
    });

    it('传入 conversation_id 时代理仍正常完成', async () => {
      const res = await request(app)
        .post('/agent/diabetes-assistant-agent')
        .send({ message: '继续对话', conversation_id: 'conv-test-123' });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('"event":"message"');
    });
  })
})

// ────────────────────────────────────────────────────────────
// AGENT_KEYS 常量验证
// ────────────────────────────────────────────────────────────

describe('AGENT_KEYS', () => {
  it('包含 diabetes-assistant-agent 映射', () => {
    const difyRouter = loadDifyModule()
    expect(difyRouter.AGENT_KEYS['diabetes-assistant-agent']).toBe('DIFY_ASSISTANT_APP_KEY')
  })

  it('包含 admin-manager-agent 映射', () => {
    const difyRouter = loadDifyModule()
    expect(difyRouter.AGENT_KEYS['admin-manager-agent']).toBe('DIFY_ADMIN_AGENT_KEY')
  })

  it('未知 agent_id 返回 undefined', () => {
    const difyRouter = loadDifyModule()
    expect(difyRouter.AGENT_KEYS['nonexistent']).toBeUndefined()
  })
})

// ────────────────────────────────────────────────────────────
// 导出方式验证（方案 B：module.exports = router）
// ────────────────────────────────────────────────────────────

describe('模块导出方式', () => {
  it('require 返回值为函数（Router 实例）', () => {
    const difyRouter = loadDifyModule()
    expect(typeof difyRouter).toBe('function')
  })

  it('proxyAgentSSE 挂载为 Router 属性', () => {
    const difyRouter = loadDifyModule()
    expect(typeof difyRouter.proxyAgentSSE).toBe('function')
  })

  it('AGENT_KEYS 挂载为 Router 属性', () => {
    const difyRouter = loadDifyModule()
    expect(typeof difyRouter.AGENT_KEYS).toBe('object')
    expect(difyRouter.AGENT_KEYS).not.toBeNull()
  })

  it('可通过解构获取 proxyAgentSSE 和 AGENT_KEYS', () => {
    const { proxyAgentSSE, AGENT_KEYS } = loadDifyModule()
    expect(typeof proxyAgentSSE).toBe('function')
    expect(typeof AGENT_KEYS).toBe('object')
  })
})
