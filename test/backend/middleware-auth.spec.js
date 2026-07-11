const authMiddleware = require('../../server/middleware/auth')

// Mock process.env.JWT_SECRET
const JWT_SECRET = 'test-jwt-secret-for-middleware-tests-32chars!!'
process.env.JWT_SECRET = JWT_SECRET

const jwt = require('jsonwebtoken')

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

describe('authMiddleware', () => {
  describe('缺少 Token', () => {
    it('无 Authorization 头返回 401', () => {
      const req = { headers: {} }
      const res = mockRes()
      const next = mockNext()
      authMiddleware(req, res, next)
      expect(res.statusCode).toBe(401)
      expect(res.body.error.code).toBe('AUTH_REQUIRED')
      expect(next.called()).toBe(false)
    })

    it('Authorization 头不以 Bearer 开头返回 401', () => {
      const req = { headers: { authorization: 'Basic xyz' } }
      const res = mockRes()
      const next = mockNext()
      authMiddleware(req, res, next)
      expect(res.statusCode).toBe(401)
      expect(next.called()).toBe(false)
    })

    it('Authorization 头 Bearer 后无 token 返回 401', () => {
      const req = { headers: { authorization: 'Bearer ' } }
      const res = mockRes()
      const next = mockNext()
      authMiddleware(req, res, next)
      expect(res.statusCode).toBe(401)
    })
  })

  describe('有效 Token', () => {
    it('合法 Token 解析后调用 next 且注入 req.user', () => {
      const token = jwt.sign(
        { id: 1, username: 'testuser', role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' }
      )
      const req = { headers: { authorization: `Bearer ${token}` } }
      const res = mockRes()
      const next = mockNext()

      authMiddleware(req, res, next)
      expect(next.called()).toBe(true)
      expect(req.user).toEqual({
        user_id: 1,
        username: 'testuser',
        role: 'user'
      })
    })

    it('admin 角色 Token 正确注入', () => {
      const token = jwt.sign(
        { id: 2, username: 'admin', role: 'admin' },
        JWT_SECRET,
        { expiresIn: '1h' }
      )
      const req = { headers: { authorization: `Bearer ${token}` } }
      const res = mockRes()
      const next = mockNext()

      authMiddleware(req, res, next)
      expect(req.user.role).toBe('admin')
    })
  })

  describe('无效 Token', () => {
    it('过期 Token 返回 401', () => {
      const token = jwt.sign(
        { id: 1, username: 'test', role: 'user' },
        JWT_SECRET,
        { expiresIn: '0s' }
      )
      const req = { headers: { authorization: `Bearer ${token}` } }
      const res = mockRes()
      const next = mockNext()

      authMiddleware(req, res, next)
      expect(res.statusCode).toBe(401)
      expect(res.body.error.code).toBe('AUTH_REQUIRED')
    })

    it('签名错误的 Token 返回 401', () => {
      const token = jwt.sign(
        { id: 1, username: 'test', role: 'user' },
        'wrong-secret-key-for-testing-purposes!',
        { expiresIn: '1h' }
      )
      const req = { headers: { authorization: `Bearer ${token}` } }
      const res = mockRes()
      const next = mockNext()

      authMiddleware(req, res, next)
      expect(res.statusCode).toBe(401)
    })

    it('格式错误的 Token 返回 401', () => {
      const req = { headers: { authorization: 'Bearer not-a-valid-jwt-token-xyz' } }
      const res = mockRes()
      const next = mockNext()

      authMiddleware(req, res, next)
      expect(res.statusCode).toBe(401)
    })

    it('空字符串 Token 返回 401', () => {
      const req = { headers: { authorization: 'Bearer ' } }
      const res = mockRes()
      const next = mockNext()

      authMiddleware(req, res, next)
      expect(res.statusCode).toBe(401)
    })
  })

  describe('JWT Token 过期错误信息', () => {
    it('TokenExpiredError 返回 Token已过期', () => {
      const token = jwt.sign(
        { id: 1, username: 'test', role: 'user' },
        JWT_SECRET,
        { expiresIn: '0s' }
      )
      const req = { headers: { authorization: `Bearer ${token}` } }
      const res = mockRes()
      const next = mockNext()

      authMiddleware(req, res, next)
      expect(res.body.error.message).toBe('Token已过期')
    })
  })

  describe('JWT Token 无效错误信息', () => {
    it('JsonWebTokenError 返回 Token无效', () => {
      const req = { headers: { authorization: 'Bearer invalid.jwt.token' } }
      const res = mockRes()
      const next = mockNext()

      authMiddleware(req, res, next)
      expect(res.body.error.message).toBe('Token无效')
    })
  })
})
