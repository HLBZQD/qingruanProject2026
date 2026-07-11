const { success, error } = require('../../server/utils/response')

// 模拟 Express res 对象
function mockRes() {
  const res = {}
  res.statusCode = 200
  res.headers = {}
  res.body = null
  res.status = function (code) {
    res.statusCode = code
    return res
  }
  res.json = function (obj) {
    res.body = obj
    return res
  }
  return res
}

describe('success()', () => {
  it('默认参数返回 200 + success:true', () => {
    const res = mockRes()
    success(res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ success: true, message: '操作成功' })
  })

  it('自定义 data 和 message', () => {
    const res = mockRes()
    success(res, { id: 1, name: 'test' }, '创建成功')
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      success: true,
      message: '创建成功',
      data: { id: 1, name: 'test' }
    })
  })

  it('data 为 null 时返回 null', () => {
    const res = mockRes()
    success(res, null, '查询成功')
    expect(res.body.data).toBe(null)
  })

  it('自定义 statusCode 201', () => {
    const res = mockRes()
    success(res, { id: 1 }, '创建成功', 201)
    expect(res.statusCode).toBe(201)
  })

  it('data 为数组', () => {
    const res = mockRes()
    success(res, [1, 2, 3], '列表查询成功')
    expect(res.body.data).toEqual([1, 2, 3])
  })
})

describe('error()', () => {
  it('默认返回 400 + 错误信息', () => {
    const res = mockRes()
    error(res, 'VALIDATION_ERROR', '参数校验失败')
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: '参数校验失败' }
    })
  })

  it('自定义 statusCode 404', () => {
    const res = mockRes()
    error(res, 'NOT_FOUND', '资源不存在', 404)
    expect(res.statusCode).toBe(404)
  })

  it('自定义 statusCode 500', () => {
    const res = mockRes()
    error(res, 'INTERNAL_ERROR', '服务端错误', 500)
    expect(res.statusCode).toBe(500)
  })
})
