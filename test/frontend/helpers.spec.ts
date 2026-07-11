import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatDate, formatTime, debounce, throttle, paginate, highlightKeyword } from '@/utils/helpers'

// ============================================================================
// formatDate
// ============================================================================
describe('formatDate', () => {
  it('yyyy-MM-dd 格式', () => {
    expect(formatDate('2026-06-15T08:30:00')).toBe('2026-06-15')
  })

  it('yyyy-MM-dd HH:mm 格式', () => {
    expect(formatDate('2026-06-15T08:30:00', 'yyyy-MM-dd HH:mm')).toBe('2026-06-15 08:30')
  })

  it('HH:mm 格式', () => {
    expect(formatDate('2026-06-15T14:45:00', 'HH:mm')).toBe('14:45')
  })

  it('zh 中文格式（不含时间）', () => {
    expect(formatDate('2026-06-15T08:30:00', 'zh')).toBe('2026年6月15日')
  })

  it('zh-full 中文格式（含时间）', () => {
    expect(formatDate('2026-06-15T08:30:00', 'zh-full')).toBe('2026年6月15日 08:30')
  })

  it('接受 Date 对象', () => {
    expect(formatDate(new Date(2026, 0, 1), 'yyyy-MM-dd')).toBe('2026-01-01')
  })

  it('接受时间戳（毫秒）', () => {
    const ts = new Date('2026-06-15T12:00:00Z').getTime()
    expect(formatDate(ts, 'yyyy-MM-dd')).toBe('2026-06-15')
  })

  it('默认格式为 yyyy-MM-dd', () => {
    expect(formatDate('2026-01-01')).toBe('2026-01-01')
  })

  it('非法日期返回原字符串', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })

  it('NaN 值（如 new Date("abc")）返回原字符串', () => {
    const d = new Date('not-a-valid-date')
    expect(formatDate(d)).toBe('Invalid Date')
  })

  it('个位数月份补零', () => {
    expect(formatDate('2026-01-05')).toBe('2026-01-05')
  })

  it('两位数月份不额外处理', () => {
    expect(formatDate('2026-12-25')).toBe('2026-12-25')
  })
})

// ============================================================================
// formatTime
// ============================================================================
describe('formatTime', () => {
  it('时间戳转 HH:mm', () => {
    const ts = new Date('2026-01-01T14:30:00').getTime()
    expect(formatTime(ts)).toBe('14:30')
  })

  it('0 返回空字符串', () => {
    expect(formatTime(0)).toBe('')
  })

  it('falsy 值返回空字符串', () => {
    expect(formatTime(null as unknown as number)).toBe('')
    expect(formatTime(undefined as unknown as number)).toBe('')
  })
})

// ============================================================================
// debounce
// ============================================================================
describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('wait 毫秒后才执行最后一次调用', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('a')
    debounced('b')
    debounced('c')

    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })

  it('immediate=true 时立即执行第一次', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100, true)

    debounced('first')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('first')

    debounced('second')
    expect(fn).toHaveBeenCalledTimes(1) // 还在等待期

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancel 取消等待中的调用', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('a')
    debounced.cancel()

    vi.advanceTimersByTime(100)
    expect(fn).not.toHaveBeenCalled()
  })

  it('flush 立即执行等待中的调用', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('a')
    debounced.flush()

    expect(fn).toHaveBeenCalledWith('a')
  })

  it('默认 wait 为 300ms', () => {
    const fn = vi.fn()
    const debounced = debounce(fn)

    debounced('x')
    vi.advanceTimersByTime(299)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledWith('x')
  })
})

// ============================================================================
// throttle
// ============================================================================
describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('首次调用立即执行', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('时间窗口内只执行一次', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled(1)
    throttled(2)
    throttled(3)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('时间窗口过后可再次执行', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled(1)
    vi.advanceTimersByTime(100)
    throttled(2)

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('trailing=true 时窗口结束时执行最后一次', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100, true)

    throttled(1) // 立即执行
    throttled(2) // 进入 trailing 队列
    throttled(3) // 覆盖 trailing 参数

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenNthCalledWith(2, 3)
  })

  it('trailing=false 时丢弃窗口内后续调用', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100, false)

    throttled(1)
    throttled(2)

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancel 取消等待中的 trailing', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100, true)

    throttled(1)
    throttled(2)
    throttled.cancel()

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

// ============================================================================
// paginate
// ============================================================================
describe('paginate', () => {
  const list = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  it('第 1 页每页 3 条', () => {
    expect(paginate(list, 1, 3)).toEqual([1, 2, 3])
  })

  it('第 2 页每页 3 条', () => {
    expect(paginate(list, 2, 3)).toEqual([4, 5, 6])
  })

  it('最后一页不足 pageSize', () => {
    expect(paginate(list, 4, 3)).toEqual([10])
  })

  it('超出范围的页码返回空数组', () => {
    expect(paginate(list, 100, 10)).toEqual([])
  })

  it('空数组返回空数组', () => {
    expect(paginate([], 1, 10)).toEqual([])
  })

  it('pageSize 大于数组长度返回全部', () => {
    expect(paginate(list, 1, 100)).toEqual(list)
  })
})

// ============================================================================
// highlightKeyword
// ============================================================================
describe('highlightKeyword', () => {
  it('高亮匹配关键词', () => {
    const result = highlightKeyword('糖尿病饮食管理', '糖尿病')
    expect(result).toContain('<mark>糖尿病</mark>')
    expect(result).toContain('饮食管理')
  })

  it('默认使用 mark 标签', () => {
    const result = highlightKeyword('Hello World', 'World')
    expect(result).toBe('Hello <mark>World</mark>')
  })

  it('自定义标签', () => {
    const result = highlightKeyword('test keyword here', 'keyword', 'em')
    expect(result).toBe('test <em>keyword</em> here')
  })

  it('忽略大小写', () => {
    const result = highlightKeyword('Hello WORLD', 'world')
    expect(result).toBe('Hello <mark>WORLD</mark>')
  })

  it('无关键词时原样返回（HTML 转义）', () => {
    const result = highlightKeyword('Hello World', '')
    expect(result).toBe('Hello World')
  })

  it('仅空格关键词原样返回', () => {
    const result = highlightKeyword('Hello World', '   ')
    expect(result).toBe('Hello World')
  })

  it('特殊正则字符被转义', () => {
    const result = highlightKeyword('test (1+1) = 2', '(1+1)')
    expect(result).toContain('<mark>(1+1)</mark>')
  })

  it('多个匹配全部高亮', () => {
    const result = highlightKeyword('apple banana apple', 'apple')
    const matches = result.match(/<mark>apple<\/mark>/g)
    expect(matches).toHaveLength(2)
  })

  it('HTML 字符被转义', () => {
    const result = highlightKeyword('<script>alert(1)</script>', 'script')
    expect(result).not.toContain('<script>')
    expect(result).toContain('&lt;')
  })
})
