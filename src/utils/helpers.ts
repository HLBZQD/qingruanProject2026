/**
 * 通用工具函数
 *
 * 设计依据: docs/4_frontend_gap_todo_v2.md A2
 * 从各视图组件抽取日期格式化、防抖、截流等高频工具，避免页面内重复定义。
 */

// ========== 日期格式化 ==========

export type DateFormat = 'yyyy-MM-dd' | 'yyyy-MM-dd HH:mm' | 'HH:mm' | 'zh' | 'zh-full'

/**
 * 将 ISO 日期字符串格式化为目标样式。
 *
 * @param iso - ISO 8601 日期字符串或时间戳
 * @param format - 输出格式，默认 'yyyy-MM-dd'
 * @returns 格式化字符串；非法输入原样返回
 */
export function formatDate(iso: string | number | Date, format: DateFormat = 'yyyy-MM-dd'): string {
  const d = typeof iso === 'object' ? iso : new Date(iso)
  if (isNaN(d.getTime())) {
    return typeof iso === 'string' ? iso : String(iso)
  }

  const yyyy = String(d.getFullYear())
  const MM = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const HH = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')

  switch (format) {
    case 'yyyy-MM-dd':
      return `${yyyy}-${MM}-${dd}`
    case 'yyyy-MM-dd HH:mm':
      return `${yyyy}-${MM}-${dd} ${HH}:${mm}`
    case 'HH:mm':
      return `${HH}:${mm}`
    case 'zh':
      return `${yyyy}年${d.getMonth() + 1}月${d.getDate()}日`
    case 'zh-full':
      return `${yyyy}年${d.getMonth() + 1}月${d.getDate()}日 ${HH}:${mm}`
    default:
      return `${yyyy}-${MM}-${dd}`
  }
}

/**
 * 将 Unix 时间戳（毫秒）格式化为 HH:mm。
 * 主要用于聊天消息时间戳。
 */
export function formatTime(timestamp: number): string {
  if (!timestamp) return ''
  return formatDate(timestamp, 'HH:mm')
}

// ========== 防抖 / 截流 ==========

export type DebouncedFn<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): ReturnType<T> | undefined
  cancel(): void
  flush(): ReturnType<T> | undefined
}

/**
 * 防抖函数：高频触发时只执行最后一次。
 *
 * @param fn - 目标函数
 * @param wait - 等待毫秒数，默认 300
 * @param immediate - 是否在触发瞬间先执行一次，默认 false
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  wait = 300,
  immediate = false,
): DebouncedFn<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let result: ReturnType<T> | undefined
  let lastArgs: Parameters<T> | null = null

  const debounced = function (...args: Parameters<T>): ReturnType<T> | undefined {
    lastArgs = args
    if (timer) clearTimeout(timer)

    if (immediate) {
      const callNow = !timer
      timer = setTimeout(() => {
        timer = null
      }, wait)
      if (callNow) {
        result = fn(...args)
        return result
      }
    } else {
      timer = setTimeout(() => {
        timer = null
        if (lastArgs) {
          result = fn(...lastArgs)
          lastArgs = null
        }
      }, wait)
    }
    return result
  }

  debounced.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    lastArgs = null
  }

  debounced.flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (lastArgs) {
      result = fn(...lastArgs)
      lastArgs = null
    }
    return result
  }

  return debounced as DebouncedFn<T>
}

export type ThrottledFn<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): ReturnType<T> | undefined
  cancel(): void
}

/**
 * 截流函数：指定时间窗口内最多执行一次。
 *
 * @param fn - 目标函数
 * @param wait - 时间窗口毫秒数，默认 300
 * @param trailing - 是否在窗口结束时执行最后一次，默认 true
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  wait = 300,
  trailing = true,
): ThrottledFn<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastArgs: Parameters<T> | null = null
  let lastResult: ReturnType<T> | undefined

  const throttled = function (...args: Parameters<T>): ReturnType<T> | undefined {
    lastArgs = args

    if (!timer) {
      lastResult = fn(...args)
      lastArgs = null
      timer = setTimeout(() => {
        timer = null
        if (trailing && lastArgs) {
          lastResult = fn(...lastArgs)
          lastArgs = null
        }
      }, wait)
    }

    return lastResult
  }

  throttled.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    lastArgs = null
  }

  return throttled as ThrottledFn<T>
}

// ========== 分页辅助 ==========

/**
 * 将数组按 pageSize 切片，常用于前端本地分页。
 */
export function paginate<T>(list: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return list.slice(start, start + pageSize)
}

/**
 * 高亮文本中的关键词（用于搜索结果显示）。
 *
 * @param text - 原文本
 * @param keyword - 关键词
 * @param tag - 包裹标签，默认 'mark'
 * @returns 包含高亮标签的 HTML 字符串；无关键词时返回原样转义文本
 */
export function highlightKeyword(text: string, keyword: string, tag = 'mark'): string {
  if (!keyword.trim()) return escapeHtml(text)
  const safeKeyword = escapeRegExp(keyword.trim())
  const regex = new RegExp(`(${safeKeyword})`, 'gi')
  return escapeHtml(text).replace(regex, `<${tag}>$1</${tag}>`)
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
