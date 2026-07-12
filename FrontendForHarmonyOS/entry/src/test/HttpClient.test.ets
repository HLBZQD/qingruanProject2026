import { describe, it, expect } from '@ohos/hypium';
import { ApiError } from '../main/ets/types/api';
import { ApiErrorBody } from '../main/ets/types/api';
import { HttpClient, HttpClientOptions, RequestOptions, HttpMethod } from '../main/ets/network/HttpClient';

export default function httpClientTest(): void {
  describe('HttpClientTest', () => {
    it('HttpClient construction stores opts', 0, () => {
      const opts: HttpClientOptions = {
        tokenProvider: () => 't',
        onUnauthorized: () => {}
      };
      const client = new HttpClient(opts);
      expect(client !== null).assertTrue();
      expect(client !== undefined).assertTrue();
    });

    it('HttpClient construction with null opts', 0, () => {
      const client1 = new HttpClient();
      expect(client1 !== null).assertTrue();

      const opts: HttpClientOptions = { tokenProvider: null, onUnauthorized: null };
      const client2 = new HttpClient(opts);
      expect(client2 !== null).assertTrue();
    });

    it('HttpMethod const assignment', 0, () => {
      const m: HttpMethod = 'GET';
      expect(m).assertEqual('GET');
    });

    it('HttpClientOptions / RequestOptions literal assignment', 0, () => {
      const hcOpts: HttpClientOptions = {
        tokenProvider: () => 'abc',
        onUnauthorized: null
      };
      expect(hcOpts.tokenProvider).assertNotNull();
      expect(hcOpts.onUnauthorized).assertNull();

      const reqOpts: RequestOptions = {
        headers: { 'X-Custom': 'val' },
        timeout: 5000,
        contentType: null
      };
      expect((reqOpts.headers as Record<string, string>)['X-Custom']).assertEqual('val');
      expect(reqOpts.timeout).assertEqual(5000);
      expect(reqOpts.contentType).assertNull();
    });

    it('ApiError construction network', 0, () => {
      const ae = new ApiError('network', '连接失败');
      expect(ae.kind).assertEqual('network');
      expect(ae.message).assertEqual('连接失败');
      expect(ae.status === undefined).assertTrue();
      expect(ae.code === undefined).assertTrue();
    });

    it('ApiError construction auth', 0, () => {
      const ae = new ApiError('auth', '未授权', 401);
      expect(ae.kind).assertEqual('auth');
      expect(ae.message).assertEqual('未授权');
      expect(ae.status).assertEqual(401);
      expect(ae.code === undefined).assertTrue();
    });

    it('ApiError construction client', 0, () => {
      const ae = new ApiError('client', 'msg', 400, 'ERR');
      expect(ae.kind).assertEqual('client');
      expect(ae.message).assertEqual('msg');
      expect(ae.status).assertEqual(400);
      expect(ae.code).assertEqual('ERR');
    });

    it('ApiError construction server', 0, () => {
      const ae = new ApiError('server', '服务错误', 500);
      expect(ae.kind).assertEqual('server');
      expect(ae.message).assertEqual('服务错误');
      expect(ae.status).assertEqual(500);
    });

    it('ApiError instanceof check', 0, () => {
      const ae = new ApiError('client', 'test', 400);
      expect(ae instanceof ApiError).assertTrue();
    });
  });
}
