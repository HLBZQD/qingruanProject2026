import { http } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';
import util from '@ohos.util';
import { safeJsonParse } from '../utils/Helpers';
import { BASE_URL } from '../common/constants/ApiEndpoints';
import { SSEMessageEvent, SSEMessageEndEvent, SSEErrorEvent } from '../types/sse';

declare type ESObject = Object;

const JSON_PARSE_SENTINEL = '__JSON_PARSE_FAILED__';

export interface SseCallbacks {
  onMessage?: (ev: SSEMessageEvent) => void;
  onMessageEnd?: (ev: SSEMessageEndEvent) => void;
  onError?: (ev: SSEErrorEvent) => void;
  onComplete?: () => void;
}

export interface SseClientOptions {
  tokenProvider: () => string | null;
  onUnauthorized?: () => void;
  callbacks: SseCallbacks;
}

export class SseClient {
  private req: http.HttpRequest | null;
  private tokenProvider: () => string | null;
  private onUnauthorized: (() => void) | null;
  private callbacks: SseCallbacks;
  private buffer: string;
  private textDecoder: util.TextDecoder;

  constructor(opts: SseClientOptions) {
    this.tokenProvider = opts.tokenProvider;
    this.onUnauthorized = opts.onUnauthorized ?? null;
    this.callbacks = opts.callbacks;
    this.buffer = '';
    this.req = null;
    this.textDecoder = new util.TextDecoder('utf-8');
  }

  start(endpoint: string, body: ESObject): void {
    this.req = http.createHttp();
    const token: string = this.tokenProvider() ?? '';
    if (token === '') {
      this.callbacks.onError?.({ event: 'error', code: 'AUTH_EXPIRED', message: '未登录，请先登录' });
      return;
    }
    this.req.on('dataReceive', (data: ArrayBuffer) => {
      const chunk: string = this.textDecoder.decodeWithStream(new Uint8Array(data), { stream: true });
      console.info('[SseClient] 收到后端数据块 <<<\n' + chunk + '\n>>>');
      this.buffer += chunk;

      // Backend proxies Dify with single-'\n' terminated events (heartbeat ':ok\n\n'
      // mixed with 'data: {...}\n'). Split on '\n' and dispatch each complete line,
      // keeping the trailing partial line in the buffer.
      const lines: string[] = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (let i = 0; i < lines.length; i++) {
        SseClient.dispatchBlock(lines[i], this.callbacks);
      }
    });
    this.req.on('dataEnd', () => {
      this.flushRemaining();
      this.callbacks.onComplete?.();
    });
    this.req.requestInStream(BASE_URL + endpoint, {
      method: http.RequestMethod.POST,
      header: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': 'Bearer ' + token
      },
      extraData: JSON.stringify(body),
      connectTimeout: 15000,
      readTimeout: 0
    }).then((responseCode: number) => {
      console.info('[SseClient] HTTP 响应码: ' + responseCode);
      if (responseCode === 401) {
        this.handle401();
      } else if (responseCode < 200 || responseCode >= 300) {
        this.callbacks.onError?.({ event: 'error', code: 'HTTP_ERROR', message: 'HTTP ' + responseCode });
      }
    }).catch((err: BusinessError) => {
      this.callbacks.onError?.({ event: 'error', code: 'NETWORK_ERROR', message: err.message ?? '网络错误' });
    });
  }

  destroy(): void {
    this.req?.destroy();
    this.req = null;
  }

  static stripThinkTag(content: string): string {
    const startTag: string = '<think>';
    const endTag: string = '</think>';
    let result: string = content;

    // Remove every complete <think>...</think> block, wherever it appears
    // (start, middle, or multiple blocks in one answer).
    let startIdx: number = result.indexOf(startTag);
    while (startIdx >= 0) {
      const endIdx: number = result.indexOf(endTag, startIdx);
      if (endIdx < 0) {
        // Unclosed <think>: model is still reasoning.
        const before: string = result.substring(0, startIdx).trim();
        return before.length > 0 ? before : '思考中...';
      }
      const before: string = result.substring(0, startIdx);
      const after: string = result.substring(endIdx + endTag.length);
      result = before + after;
      startIdx = result.indexOf(startTag);
    }

    // Drop any stray closing tag left over from malformed streaming chunks.
    result = result.split(endTag).join('');
    return result.trim();
  }

  static dispatchBlock(block: string, callbacks: SseCallbacks): void {
    const lines: string[] = block.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line: string = lines[i].trim();
      if (line === '' || line.startsWith(':')) {
        // Empty line or SSE comment/heartbeat (e.g. ':ok') — ignore.
        continue;
      }
      // A bare JSON object without the 'data: ' prefix means the backend returned a
      // plain error body (e.g. auth/validation failure) rather than an SSE stream.
      if (!line.startsWith('data: ')) {
        if (line.startsWith('{')) {
          const errObj = safeJsonParse<Record<string, ESObject>>(line, JSON_PARSE_SENTINEL as Object as Record<string, ESObject>);
          if ((errObj as Object) !== JSON_PARSE_SENTINEL) {
            callbacks.onError?.({ event: 'error', code: 'HTTP_ERROR', message: SseClient.humanizeError(errObj) });
          }
        }
        continue;
      }
      const jsonStr: string = line.substring(6);
      console.info('[SseClient] SSE 事件 data: ' + jsonStr);
      const parsed = safeJsonParse<Record<string, ESObject>>(jsonStr, JSON_PARSE_SENTINEL as Object as Record<string, ESObject>);
      if ((parsed as Object) === JSON_PARSE_SENTINEL) {
        console.warn('SseClient: JSON parse failed for block:', jsonStr.substring(0, 100));
        continue;
      }
      const eventType = parsed['event'];
      if (eventType === 'error') {
        callbacks.onError?.({ event: 'error', code: SseClient.extractCode(parsed), message: SseClient.humanizeError(parsed) });
      } else if (eventType === 'message_end') {
        callbacks.onMessageEnd?.(parsed as Object as SSEMessageEndEvent);
      } else if (parsed['answer'] !== undefined) {
        callbacks.onMessage?.(parsed as Object as SSEMessageEvent);
      }
    }
  }

  private static extractCode(parsed: Record<string, ESObject>): string {
    const code = parsed['code'];
    if (typeof code === 'string' && code.length > 0) {
      return code;
    }
    return 'DIFY_ERROR';
  }

  // Dify surfaces upstream model failures as deeply-nested JSON strings inside the
  // 'message' field. Translate the common ones into short, user-friendly Chinese.
  static humanizeError(parsed: Record<string, ESObject>): string {
    let raw: string = '';
    const msg = parsed['message'];
    if (typeof msg === 'string') {
      raw = msg;
    } else {
      const errNode = parsed['error'];
      if (errNode !== undefined && errNode !== null) {
        const nestedMsg = (errNode as Record<string, ESObject>)['message'];
        if (typeof nestedMsg === 'string') {
          raw = nestedMsg;
        }
      }
    }

    if (raw.length === 0) {
      return '服务暂时不可用，请稍后再试';
    }

    const lower: string = raw.toLowerCase();
    if (lower.includes('insufficient balance') || lower.includes('402')) {
      return 'AI 服务额度不足，请联系管理员，稍后再试';
    }
    if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many requests')) {
      return '请求过于频繁，请稍后再试';
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return 'AI 服务响应超时，请稍后重试';
    }
    if (lower.includes('unauthorized') || lower.includes('401') || lower.includes('api key') || lower.includes('invalid_api')) {
      return 'AI 服务配置异常，请联系管理员';
    }
    if (lower.includes('invokeerror') || lower.includes('upstream') || lower.includes('502') || lower.includes('503')) {
      return 'AI 服务暂时不可用，请稍后再试';
    }
    // Unknown structured error — avoid dumping raw JSON at the user.
    if (raw.trimStart().startsWith('{') || raw.length > 80) {
      return '服务出错了，请稍后再试';
    }
    return raw;
  }

  private flushRemaining(): void {
    if (this.buffer.trim().length > 0) {
      SseClient.dispatchBlock(this.buffer, this.callbacks);
      this.buffer = '';
    }
  }

  private handle401(): void {
    this.onUnauthorized?.();
    this.callbacks.onError?.({ event: 'error', code: 'AUTH_EXPIRED', message: '登录已过期' });
    this.destroy();
  }
}
