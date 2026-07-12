import { http } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { BASE_URL } from '../common/constants/ApiEndpoints';
import { safeJsonParse } from '../utils/Helpers';
import { ApiError } from '../types/api';

declare type ESObject = Object;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface HttpClientOptions {
  tokenProvider: (() => string | null) | null;
  onUnauthorized: (() => void) | null;
}

export interface RequestOptions {
  headers: Record<string, string> | null;
  timeout: number | null;
  contentType: string | null;
}

const JSON_PARSE_SENTINEL = '__JSON_PARSE_FAILED__';

function mapHttpMethod(method: HttpMethod): http.RequestMethod {
  switch (method) {
    case 'GET':
      return http.RequestMethod.GET;
    case 'POST':
      return http.RequestMethod.POST;
    case 'PUT':
      return http.RequestMethod.PUT;
    case 'DELETE':
      return http.RequestMethod.DELETE;
    case 'PATCH':
      return http.RequestMethod.POST;
    default:
      return http.RequestMethod.GET;
  }
}

function extractMessage(errBody: Record<string, Object>): string {
  if (errBody && typeof errBody === 'object') {
    const msg = errBody['message'];
    if (typeof msg === 'string') {
      return msg;
    }
    const inner = errBody['error'];
    if (inner && typeof inner === 'object') {
      const innerMsg = (inner as Record<string, Object>)['message'];
      if (typeof innerMsg === 'string') {
        return innerMsg;
      }
    }
  }
  return 'Unknown error';
}

export class HttpClient {
  private tokenProvider: (() => string | null) | null;
  private onUnauthorized: (() => void) | null;

  constructor(opts?: HttpClientOptions) {
    this.tokenProvider = opts?.tokenProvider ?? null;
    this.onUnauthorized = opts?.onUnauthorized ?? null;
  }

  async request<T>(method: HttpMethod, endpoint: string, body?: ESObject | null, opts?: RequestOptions): Promise<T> {
    const httpRequest = http.createHttp();
    try {
      const contentType = opts?.contentType ?? 'application/json';
      let headers: Record<string, string> = { 'Content-Type': contentType };
      const token = this.tokenProvider?.();
      if (token !== null && token !== undefined && token !== '') {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (opts?.headers !== null && opts?.headers !== undefined) {
        const extraHeaders: Record<string, string> = opts.headers;
        const keys = Object.keys(extraHeaders);
        for (let i = 0; i < keys.length; i++) {
          const key: string = keys[i];
          headers[key] = extraHeaders[key];
        }
      }

      let requestBody: string | undefined = undefined;
      if (body !== null && body !== undefined) {
        requestBody = JSON.stringify(body);
      }
      const timeout: number = opts?.timeout ?? 60000;

      const reqMethod = mapHttpMethod(method);

      const response = await httpRequest.request(BASE_URL + endpoint, {
        method: reqMethod as http.RequestMethod,
        header: headers,
        extraData: requestBody,
        connectTimeout: timeout,
        readTimeout: timeout
      });

      const responseCode: number = response.responseCode;
      const resultStr: string = response.result as string;

      if (responseCode >= 200 && responseCode <= 299) {
        const parsed: T = safeJsonParse<T>(resultStr, JSON_PARSE_SENTINEL as Object as T);
        if ((parsed as Object) === JSON_PARSE_SENTINEL) {
          throw new ApiError('client', 'Unknown response format', responseCode);
        }
        return parsed;
      }

      if (responseCode === 401) {
        this.onUnauthorized?.();
        throw new ApiError('auth', '未授权', 401);
      }

      if (responseCode >= 400 && responseCode <= 499) {
        const errBody: Record<string, Object> = safeJsonParse(resultStr, {} as Record<string, Object>);
        const message: string = extractMessage(errBody);
        throw new ApiError('client', message, responseCode);
      }

      if (responseCode >= 500) {
        const errBody: Record<string, Object> = safeJsonParse(resultStr, {} as Record<string, Object>);
        const message: string = extractMessage(errBody);
        throw new ApiError('server', message, responseCode);
      }

      const errBody: Record<string, Object> = safeJsonParse(resultStr, {} as Record<string, Object>);
      const message: string = extractMessage(errBody);
      throw new ApiError('client', message, responseCode);
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
      const errMsg: string = (err as BusinessError).message ?? (err as Error).message ?? 'Network error';
      throw new ApiError('network', errMsg);
    } finally {
      httpRequest.destroy();
    }
  }
}
