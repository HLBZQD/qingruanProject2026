const { parseDateRange } = require('../../server/utils/dateRange')

describe('parseDateRange', () => {
  it('无参数时返回 null/null', () => {
    const result = parseDateRange({})
    expect(result).toEqual({ startDate: null, endDate: null })
  })

  it('仅 startDate 返回正确值', () => {
    const result = parseDateRange({ startDate: '2026-01-01' })
    expect(result.startDate).toBe('2026-01-01')
    expect(result.endDate).toBe(null)
  })

  it('仅 endDate 返回带 T23:59:59 的值', () => {
    const result = parseDateRange({ endDate: '2026-06-30' })
    expect(result.startDate).toBe(null)
    expect(result.endDate).toBe('2026-06-30T23:59:59')
  })

  it('同时有 startDate 和 endDate 返回正确值', () => {
    const result = parseDateRange({ startDate: '2026-01-01', endDate: '2026-06-30' })
    expect(result.startDate).toBe('2026-01-01')
    expect(result.endDate).toBe('2026-06-30T23:59:59')
  })

  it('startDate 格式错误抛出异常', () => {
    expect(() => parseDateRange({ startDate: '2026/01/01' }))
      .toThrow()
  })

  it('startDate 格式错误抛出 VALIDATION_ERROR', () => {
    try {
      parseDateRange({ startDate: '01-01-2026' })
      fail('应该抛出异常')
    } catch (e) {
      expect(e.code).toBe('VALIDATION_ERROR')
      expect(e.statusCode).toBe(422)
    }
  })

  it('endDate 格式错误抛出异常', () => {
    expect(() => parseDateRange({ endDate: '20260630' })).toThrow()
  })

  it('endDate 格式错误抛出 VALIDATION_ERROR', () => {
    try {
      parseDateRange({ endDate: '2026-06-30T00:00:00' })
      fail('应该抛出异常')
    } catch (e) {
      expect(e.code).toBe('VALIDATION_ERROR')
    }
  })

  it('startDate 晚于 endDate 抛出异常', () => {
    try {
      parseDateRange({ startDate: '2026-12-31', endDate: '2026-01-01' })
      fail('应该抛出异常')
    } catch (e) {
      expect(e.message).toBe('开始日期不能晚于结束日期')
    }
  })

  it('startDate 等于 endDate 不抛异常', () => {
    const result = parseDateRange({ startDate: '2026-06-15', endDate: '2026-06-15' })
    expect(result.startDate).toBe('2026-06-15')
    expect(result.endDate).toBe('2026-06-15T23:59:59')
  })

  it('startDate 含非法字符抛出异常', () => {
    expect(() => parseDateRange({ startDate: 'abc-def-gh' })).toThrow()
  })

  it('保留原有 query 其他字段', () => {
    const result = parseDateRange({ startDate: '2026-01-01', other: 'value' })
    expect(result.startDate).toBe('2026-01-01')
  })
})
