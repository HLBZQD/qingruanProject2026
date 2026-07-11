const difyAuthMiddleware = require('../../server/middleware/difyAuth')

function mockRes() {
  const res = {}
  res.statusCode = 200
  res.body = null
  res.status = function (code) { res.statusCode = code; return res }
  res.json = function (obj) { res.body = obj; return res }
  return res
}

function mockNext() {
  let called = false
  const fn = () => { called = true }
  fn.called = () => called
  return fn
}

const VALID_API_KEY = 'dify-service-api-key-for-testing-32chars'

describe('difyAuthMiddleware', () => {
  beforeEach(() => {
    process.env.DIFY_SERVICE_API_KEY = VALID_API_KEY
  })

  afterEach(() => {
    delete process.env.DIFY_SERVICE_API_KEY
  })

  describe('无 API Key（非 Dify 回调请求）', () => {
    it('请求体中无 api_key 字段直接 next', () => {
      const req = { body: { user_id: 1 } }
      const res = mockRes()
      const next = mockNext()
      difyAuthMiddleware(req, res, next)
      expect(next.called()).toBe(true)
    })

    it('请求体为空对象直接 next', () => {
      const req = { body: {} }
      const res = mockRes()
      const next = mockNext()
      difyAuthMiddleware(req, res, next)
      expect(next.called()).toBe(true)
    })
  })

  describe('服务端未配置 DIFY_SERVICE_API_KEY', () => {
    it('返回 500 INTERNAL_ERROR', () => {
      delete process.env.DIFY_SERVICE_API_KEY
      const req = { body: { api_key: 'any-key', user_id: 1 } }
      const res = mockRes()
      const next = mockNext()
      difyAuthMiddleware(req, res, next)
      expect(res.statusCode).toBe(500)
      expect(res.body.error.code).toBe('INTERNAL_ERROR')
      expect(next.called()).toBe(false)
    })
  })

  describe('API Key 校验', () => {
    it('正确 API Key 且含 user_id 调用 next 并注入 difyAuth', () => {
      const req = { body: { api_key: VALID_API_KEY, user_id: 1 } }
      const res = mockRes()
      const next = mockNext()
      difyAuthMiddleware(req, res, next)
      expect(next.called()).toBe(true)
      expect(req.difyAuth).toEqual({ userId: 1, mode: 'callback' })
    })

    it('错误 API Key 返回 403', () => {
      const req = { body: { api_key: 'wrong-api-key-value', user_id: 1 } }
      const res = mockRes()
      const next = mockNext()
      difyAuthMiddleware(req, res, next)
      expect(res.statusCode).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
      expect(next.called()).toBe(false)
    })

    it('正确 API Key 但缺少 user_id 返回 400', () => {
      const req = { body: { api_key: VALID_API_KEY } }
      const res = mockRes()
      const next = mockNext()
      difyAuthMiddleware(req, res, next)
      expect(res.statusCode).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toBe('Dify回调缺少user_id参数')
      expect(next.called()).toBe(false)
    })

    it('正确 API Key 但 user_id 为 0（falsy 值）返回 400', () => {
      const req = { body: { api_key: VALID_API_KEY, user_id: 0 } }
      const res = mockRes()
      const next = mockNext()
      difyAuthMiddleware(req, res, next)
      expect(res.statusCode).toBe(400)
    })
  })
})
