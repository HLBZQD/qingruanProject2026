const adminMiddleware = require('../../server/middleware/admin')

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

describe('adminMiddleware', () => {
  it('req.user 不存在返回 401', () => {
    const req = {}
    const res = mockRes()
    const next = mockNext()
    adminMiddleware(req, res, next)
    expect(res.statusCode).toBe(401)
    expect(res.body.error.code).toBe('AUTH_REQUIRED')
    expect(next.called()).toBe(false)
  })

  it('req.user.role = user 返回 403', () => {
    const req = { user: { user_id: 1, username: 'user1', role: 'user' } }
    const res = mockRes()
    const next = mockNext()
    adminMiddleware(req, res, next)
    expect(res.statusCode).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
    expect(res.body.error.message).toBe('权限不足，仅管理员可操作')
    expect(next.called()).toBe(false)
  })

  it('req.user.role = admin 调用 next', () => {
    const req = { user: { user_id: 1, username: 'admin', role: 'admin' } }
    const res = mockRes()
    const next = mockNext()
    adminMiddleware(req, res, next)
    expect(next.called()).toBe(true)
    expect(res.statusCode).toBe(200)
  })

  it('req.user.role 为其他值返回 403', () => {
    const req = { user: { user_id: 1, username: 'test', role: 'moderator' } }
    const res = mockRes()
    const next = mockNext()
    adminMiddleware(req, res, next)
    expect(res.statusCode).toBe(403)
  })
})
