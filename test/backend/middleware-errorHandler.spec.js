const { errorHandler, AppError } = require('../../server/middleware/errorHandler')

function mockRes() {
  const res = {}
  res.statusCode = 200
  res.body = null
  res.status = function (code) { res.statusCode = code; return res }
  res.json = function (obj) { res.body = obj; return res }
  return res
}

describe('AppError', () => {
  it('构造 AppError 含 statusCode, code, message', () => {
    const err = new AppError(404, 'NOT_FOUND', '资源未找到')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AppError)
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toBe('资源未找到')
  })

  it('AppError 实例可被 instanceof 检测', () => {
    const err = new AppError(422, 'VALIDATION_ERROR', '校验失败')
    expect(err instanceof AppError).toBe(true)
  })
})

describe('errorHandler', () => {
  const originalError = console.error
  beforeAll(() => {
    console.error = () => {}
  })
  afterAll(() => {
    console.error = originalError
  })

  it('AppError 实例返回对应 statusCode 和错误信息', () => {
    const err = new AppError(422, 'VALIDATION_ERROR', '参数校验失败')
    const res = mockRes()
    errorHandler(err, {}, res, () => {})
    expect(res.statusCode).toBe(422)
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: '参数校验失败' }
    })
  })

  it('AppError 404 返回对应格式', () => {
    const err = new AppError(404, 'NOT_FOUND', '资源不存在')
    const res = mockRes()
    errorHandler(err, {}, res, () => {})
    expect(res.statusCode).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('非 AppError 实例返回 500 INTERNAL_ERROR', () => {
    const err = new Error('未知错误')
    const res = mockRes()
    errorHandler(err, {}, res, () => {})
    expect(res.statusCode).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL_ERROR')
    expect(res.body.error.message).toBe('服务端内部错误')
  })

  it('普通字符串错误返回 500', () => {
    const res = mockRes()
    errorHandler('something wrong', {}, res, () => {})
    expect(res.statusCode).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL_ERROR')
  })

  it('AppError 403 FORBIDDEN', () => {
    const err = new AppError(403, 'FORBIDDEN', '权限不足')
    const res = mockRes()
    errorHandler(err, {}, res, () => {})
    expect(res.statusCode).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })
})
