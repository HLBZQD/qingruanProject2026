/**
 * 从任意类型的错误对象中提取用户可读的错误消息。
 *
 * 提取优先级（按顺序尝试）:
 *   1. Axios 错误响应消息: err.response?.data?.error?.message 或 err.response?.data?.message
 *   2. 标准 Error 对象: err.message
 *   3. 字符串错误: err 本身
 *   4. 以上都不匹配: 返回 fallback 默认值
 *
 * 设计依据: a_v8_diag_v3.md G8（第456-464行）
 * 合并来源: LifePlan.vue:102-109 + Punch.vue:63-77
 *
 * 与 G14（success 拦截器）的兼容性:
 *   G14 构造的 Error 对象附加了 { response: { data: { message } } } 属性，
 *   本函数的优先级1会正确提取 Axios 错误响应中的 message 字段。
 *
 * @param err      - 捕获的错误对象（类型 unknown，来自 catch 块）
 * @param fallback - 无可提取消息时的默认文案（默认: '操作失败，请稍后重试'）
 * @returns 用户可读的错误消息字符串
 */
export function getErrorMessage(
  err: unknown,
  fallback: string = '操作失败，请稍后重试',
): string {
  // 优先级 1: Axios 错误响应消息
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as {
      response?: {
        data?: {
          error?: { message?: string }
          message?: string
        }
      }
    }).response
    if (response?.data?.error?.message) return response.data.error.message
    if (response?.data?.message) return response.data.message
  }

  // 优先级 2: 标准 Error 对象
  if (err instanceof Error) return err.message

  // 优先级 3: 字符串错误
  if (typeof err === 'string') return err

  // 优先级 4: 默认 fallback
  return fallback
}
