const optionalAuth = require('../../server/middleware/optionalAuth')
const jwt = require('jsonwebtoken')

const JWT_SECRET = 'test-optional-auth-secret-32chars!!!'
process.env.JWT_SECRET = JWT_SECRET

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

describe('optionalAuth', () => {
  it('无 Authorization 头直接调用 next（不报错）', () => {
    const req = { headers: {} }
    const res = mockRes()
    const next = mockNext()
    optionalAuth(req, res, next)
    expect(next.called()).toBe(true)
    expect(req.user).toBeUndefined()
  })

  it('Authorization 头不以 Bearer 开头直接调用 next', () => {
    const req = { headers: { authorization: 'Basic xyz' } }
    const res = mockRes()
    const next = mockNext()
    optionalAuth(req, res, next)
    expect(next.called()).toBe(true)
    expect(req.user).toBeUndefined()
  })

  it('Bearer 后无 token 直接调用 next', () => {
    const req = { headers: { authorization: 'Bearer ' } }
    const res = mockRes()
    const next = mockNext()
    optionalAuth(req, res, next)
    expect(next.called()).toBe(true)
  })

  it('合法 Token 注入 req.user', () => {
    const token = jwt.sign(
      { id: 5, username: 'user5', role: 'user' },
      JWT_SECRET,
      { expiresIn: '1h' }
    )
    const req = { headers: { authorization: `Bearer ${token}` } }
    const res = mockRes()
    const next = mockNext()

    optionalAuth(req, res, next)
    expect(next.called()).toBe(true)
    expect(req.user).toEqual({
      user_id: 5,
      username: 'user5',
      role: 'user'
    })
  })

  it('过期 Token 不注入 user，直接调用 next（不报错）', () => {
    const token = jwt.sign(
      { id: 1, username: 'test', role: 'user' },
      JWT_SECRET,
      { expiresIn: '0s' }
    )
    const req = { headers: { authorization: `Bearer ${token}` } }
    const res = mockRes()
    const next = mockNext()

    optionalAuth(req, res, next)
    expect(next.called()).toBe(true)
    expect(req.user).toBeUndefined()
  })

  it('无效 Token 不注入 user，直接调用 next', () => {
    const req = { headers: { authorization: 'Bearer invalid-token-xyz' } }
    const res = mockRes()
    const next = mockNext()

    optionalAuth(req, res, next)
    expect(next.called()).toBe(true)
    expect(req.user).toBeUndefined()
  })
})
