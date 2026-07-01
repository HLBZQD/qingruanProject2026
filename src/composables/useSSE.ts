import type {
  SSEEvent,
  SSEMessageEvent,
  SSEMessageEndEvent,
  SSEErrorEvent,
} from '@/types/sse'

/**
 * 通用 SSE 流式请求封装。
 *
 * 设计依据: docs/4_frontend_gap_todo_v2.md A6
 * 从 chatStore.ts 和 Admin.vue 中抽取通用的 SSE 解析/读取/分发逻辑，
 * 供 chatStore 内部调用；下游页面仍通过 chatStore 高层接口消费。
 */

// ========== 解析 SSE 缓冲区 ==========

export interface ParseSSEBufferResult {
  events: SSEEvent[]
  remaining: string
}

/**
 * 按 \n\n 分隔解析 SSE 事件块。
 *
 * 设计依据: docs/2_detailed_design_v3.md 3.3 节 (第2373行):
 *   "前端在 fetch 的 ReadableStream 中按 \n\n 分隔事件块，
 *    每行去除 data: 前缀后 JSON.parse 解析"
 *
 * @param buffer - 当前累积的文本缓冲区
 * @returns 解析出的事件列表 + 剩余未完成文本
 */
export function parseSSEBuffer(buffer: string): ParseSSEBufferResult {
  const events: SSEEvent[] = []

  // 按 \n\n 分隔事件块 (SSE 协议标准分隔符)
  const parts = buffer.split('\n\n')
  // 最后一部分可能是不完整的半截块，留待后续 chunk 拼接
  const remaining = parts.pop() || ''

  for (const part of parts) {
    if (!part.trim()) continue

    // 按行处理每个事件块
    const lines = part.split('\n')
    let dataLine = ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        dataLine = line.slice(6) // 去除 "data: " 前缀
      }
      // 忽略其他行 (event: 行、空行等)
    }

    if (!dataLine) continue

    try {
      const parsed = JSON.parse(dataLine) as SSEEvent
      events.push(parsed)
    } catch {
      // JSON 解析失败: 静默跳过损坏的事件块
      console.warn('[useSSE] SSE 事件 JSON 解析失败:', dataLine.slice(0, 100))
    }
  }

  return { events, remaining }
}

// ========== 读取 SSE 流 ==========

/**
 * SSE 流读取循环。
 *
 * 持续读取 ReadableStream，将解析出的每个 SSEEvent 交给 onEvent 处理。
 * 读取结束后释放 reader 锁。
 *
 * @param reader - fetch Response.body.getReader() 返回的 reader
 * @param onEvent - 每个事件的处理回调
 */
export async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // 解码 chunk → 文本 (stream: true 保留不完整的多字节字符)
      buffer += decoder.decode(value, { stream: true })

      const result = parseSSEBuffer(buffer)
      buffer = result.remaining
      for (const event of result.events) {
        onEvent(event)
      }
    }
  } finally {
    // 确保流资源释放
    reader.releaseLock()
  }
}

// ========== 分发 SSE 事件 ==========

export interface SSEDispatchHandlers {
  /** message / agent_message 事件：AI 逐 token 生成 */
  onMessage?: (event: SSEMessageEvent) => void
  /** message_end 事件：完整回复结束 */
  onMessageEnd?: (event: SSEMessageEndEvent) => void
  /** error 事件：流内逻辑错误 */
  onError?: (event: SSEErrorEvent) => void
  /** 默认兜底：未知事件静默忽略 */
  onDefault?: (event: SSEEvent) => void
}

/**
 * 根据 event 字段分发处理 SSE 事件。
 *
 * 提供通用分发框架；业务侧通过 handlers 注入各自状态更新逻辑。
 * chatStore 和 Admin.vue 均使用此函数替代各自的 dispatchSSEEvent 内联实现。
 */
export function dispatchSSEEvent(
  event: SSEEvent,
  handlers: SSEDispatchHandlers = {},
): void {
  switch (event.event) {
    case 'message':
    // Dify Agent 类型返回 agent_message 事件，结构与 message 一致，统一处理
    case 'agent_message': {
      handlers.onMessage?.(event as SSEMessageEvent)
      break
    }
    case 'message_end': {
      handlers.onMessageEnd?.(event as SSEMessageEndEvent)
      break
    }
    case 'error': {
      handlers.onError?.(event as SSEErrorEvent)
      break
    }
    // 以下事件类型静默忽略 (设计文档 3.3 节标注为可选/预扩展)
    case 'workflow_started':
    case 'workflow_finished':
    case 'agent_thought':
      // 不渲染，不报错 — 容错处理
      break
    default:
      handlers.onDefault?.(event)
      break
  }
}

// ========== Composable 入口 ==========

export function useSSE() {
  return {
    parseSSEBuffer,
    readSSEStream,
    dispatchSSEEvent,
  }
}
