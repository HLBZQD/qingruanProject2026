import { describe, it, expect, vi } from 'vitest'
import { parseSSEBuffer, dispatchSSEEvent } from '@/composables/useSSE'
import type { SSEEvent, SSEMessageEvent, SSEMessageEndEvent, SSEErrorEvent } from '@/types/sse'

// ============================================================================
// parseSSEBuffer
// ============================================================================
describe('parseSSEBuffer', () => {
  it('解析单个 message 事件', () => {
    const data = 'data: {"event":"message","answer":"你好","conversation_id":"conv-1"}\n\n'
    const result = parseSSEBuffer(data)
    expect(result.events).toHaveLength(1)
    expect(result.events[0].event).toBe('message')
    expect((result.events[0] as SSEMessageEvent).answer).toBe('你好')
    expect(result.remaining).toBe('')
  })

  it('解析多个事件', () => {
    const data =
      'data: {"event":"message","answer":"你好"}\n\n' +
      'data: {"event":"message_end","conversation_id":"conv-1"}\n\n'
    const result = parseSSEBuffer(data)
    expect(result.events).toHaveLength(2)
    expect(result.events[0].event).toBe('message')
    expect(result.events[1].event).toBe('message_end')
  })

  it('不完整事件块保留到 remaining', () => {
    const data = 'data: {"event":"mess'
    const result = parseSSEBuffer(data)
    expect(result.events).toHaveLength(0)
    expect(result.remaining).toBe(data)
  })

  it('空行跳过', () => {
    const data = '\n\ndata: {"event":"message","answer":"Hi"}\n\n'
    const result = parseSSEBuffer(data)
    expect(result.events).toHaveLength(1)
  })

  it('空缓冲区返回空结果', () => {
    const result = parseSSEBuffer('')
    expect(result.events).toHaveLength(0)
    expect(result.remaining).toBe('')
  })

  it('不含 data: 前缀的行被忽略', () => {
    const data = 'event: message\ndata: {"event":"message","answer":"Hi"}\n\n'
    const result = parseSSEBuffer(data)
    expect(result.events).toHaveLength(1)
  })

  it('JSON 解析失败静默跳过', () => {
    const data = 'data: not-valid-json\n\n'
    const result = parseSSEBuffer(data)
    expect(result.events).toHaveLength(0)
  })

  it('累积缓冲区场景：先部分后完整', () => {
    // 模拟两次 parse，模拟 stream 场景
    const chunk1 = 'data: {"event":"message","answer":"你'
    const r1 = parseSSEBuffer(chunk1)
    expect(r1.events).toHaveLength(0)
    expect(r1.remaining).toBe(chunk1)

    const chunk2 = r1.remaining + '好"}\n\n'
    const r2 = parseSSEBuffer(chunk2)
    expect(r2.events).toHaveLength(1)
    expect((r2.events[0] as SSEMessageEvent).answer).toBe('你好')
    expect(r2.remaining).toBe('')
  })
})

// ============================================================================
// dispatchSSEEvent
// ============================================================================
describe('dispatchSSEEvent', () => {
  it('message 事件调用 onMessage handler', () => {
    const onMessage = vi.fn()
    const event: SSEEvent = {
      event: 'message',
      answer: '你好',
      conversation_id: 'conv-1',
      message_id: 'msg-1',
      created_at: 1700000000,
    }
    dispatchSSEEvent(event, { onMessage })
    expect(onMessage).toHaveBeenCalledWith(event)
  })

  it('message_end 事件调用 onMessageEnd handler', () => {
    const onMessageEnd = vi.fn()
    const event: SSEEvent = {
      event: 'message_end',
      conversation_id: 'conv-1',
      message_id: 'msg-1',
      created_at: 1700000000,
    }
    dispatchSSEEvent(event, { onMessageEnd })
    expect(onMessageEnd).toHaveBeenCalledWith(event)
  })

  it('error 事件调用 onError handler', () => {
    const onError = vi.fn()
    const event: SSEEvent = {
      event: 'error',
      message: '工具调用失败',
    }
    dispatchSSEEvent(event, { onError })
    expect(onError).toHaveBeenCalledWith(event)
  })

  it('message_end 事件不触发 onMessage', () => {
    const onMessage = vi.fn()
    const onMessageEnd = vi.fn()
    const event: SSEEvent = {
      event: 'message_end',
      conversation_id: 'conv-1',
      message_id: 'msg-1',
      created_at: 1700000000,
    }
    dispatchSSEEvent(event, { onMessage, onMessageEnd })
    expect(onMessage).not.toHaveBeenCalled()
    expect(onMessageEnd).toHaveBeenCalled()
  })

  it('workflow_started 等已知事件静默忽略', () => {
    const onDefault = vi.fn()
    dispatchSSEEvent({ event: 'workflow_started' }, { onDefault })
    expect(onDefault).not.toHaveBeenCalled()
  })

  it('workflow_finished 静默忽略', () => {
    const onDefault = vi.fn()
    dispatchSSEEvent({ event: 'workflow_finished' }, { onDefault })
    expect(onDefault).not.toHaveBeenCalled()
  })

  it('agent_message 静默忽略', () => {
    const onDefault = vi.fn()
    dispatchSSEEvent({ event: 'agent_message' }, { onDefault })
    expect(onDefault).not.toHaveBeenCalled()
  })

  it('agent_thought 静默忽略', () => {
    const onDefault = vi.fn()
    dispatchSSEEvent({ event: 'agent_thought' }, { onDefault })
    expect(onDefault).not.toHaveBeenCalled()
  })

  it('未知事件类型调用 onDefault', () => {
    const onDefault = vi.fn()
    const event: SSEEvent = { event: 'unknown_event_type' }
    dispatchSSEEvent(event, { onDefault })
    expect(onDefault).toHaveBeenCalledWith(event)
  })

  it('handlers 为空时不抛异常', () => {
    expect(() => dispatchSSEEvent({ event: 'message', answer: 'test' })).not.toThrow()
  })
})
