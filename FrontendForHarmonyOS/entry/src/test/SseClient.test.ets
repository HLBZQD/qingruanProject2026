import { describe, it, expect } from '@ohos/hypium';
import { SseClient, SseCallbacks, SseClientOptions } from '../main/ets/network/SseClient';
import { SSEMessageEvent, SSEMessageEndEvent, SSEErrorEvent } from '../main/ets/types/sse';

export default function sseClientTest(): void {
  describe('SseClientTest', () => {
    it('SseClient construction stores opts', 0, () => {
      const opts: SseClientOptions = {
        tokenProvider: () => 't',
        callbacks: {}
      };
      const client = new SseClient(opts);
      expect(client !== null).assertTrue();
      expect(client !== undefined).assertTrue();
    });

    it('SseClient construction with onUnauthorized', 0, () => {
      let authCalled = false;
      const opts: SseClientOptions = {
        tokenProvider: () => 't',
        onUnauthorized: () => { authCalled = true; },
        callbacks: { onMessage: (_ev: SSEMessageEvent) => {}, onComplete: () => {} }
      };
      const client = new SseClient(opts);
      expect(client !== null).assertTrue();
      expect(authCalled).assertFalse();
    });

    it('dispatchBlock processes message event', 0, () => {
      let msgCount = 0;
      let endCount = 0;
      let errCount = 0;
      let lastMsg: SSEMessageEvent | null = null;

      const cbs: SseCallbacks = {
        onMessage: (ev: SSEMessageEvent) => { msgCount++; lastMsg = ev; },
        onMessageEnd: (_ev: SSEMessageEndEvent) => { endCount++; },
        onError: (_ev: SSEErrorEvent) => { errCount++; }
      };

      SseClient.dispatchBlock('data: {"event":"message","answer":"你好","conversation_id":"c1","message_id":"m1","created_at":1719139200}\n\n', cbs);

      expect(msgCount).assertEqual(1);
      expect(endCount).assertEqual(0);
      expect(errCount).assertEqual(0);
      expect(lastMsg).assertNotNull();
      if (lastMsg !== null) {
        expect(lastMsg.event).assertEqual('message');
        expect(lastMsg.answer).assertEqual('你好');
      }
    });

    it('dispatchBlock processes message_end event', 0, () => {
      let msgCount = 0;
      let endCount = 0;
      let errCount = 0;

      const cbs: SseCallbacks = {
        onMessage: (_ev: SSEMessageEvent) => { msgCount++; },
        onMessageEnd: (_ev: SSEMessageEndEvent) => { endCount++; },
        onError: (_ev: SSEErrorEvent) => { errCount++; }
      };

      SseClient.dispatchBlock('data: {"event":"message_end","conversation_id":"c1","message_id":"m1","created_at":1719139200}\n\n', cbs);

      expect(endCount).assertEqual(1);
      expect(msgCount).assertEqual(0);
      expect(errCount).assertEqual(0);
    });

    it('dispatchBlock processes error event', 0, () => {
      let msgCount = 0;
      let endCount = 0;
      let errCount = 0;

      const cbs: SseCallbacks = {
        onMessage: (_ev: SSEMessageEvent) => { msgCount++; },
        onMessageEnd: (_ev: SSEMessageEndEvent) => { endCount++; },
        onError: (_ev: SSEErrorEvent) => { errCount++; }
      };

      SseClient.dispatchBlock('data: {"event":"error","message":"服务异常","code":"SERVER_ERROR"}\n\n', cbs);

      expect(errCount).assertEqual(1);
      expect(msgCount).assertEqual(0);
      expect(endCount).assertEqual(0);
    });

    it('dispatchBlock silently ignores workflow events', 0, () => {
      let msgCount = 0;
      let endCount = 0;
      let errCount = 0;

      const cbs: SseCallbacks = {
        onMessage: (_ev: SSEMessageEvent) => { msgCount++; },
        onMessageEnd: (_ev: SSEMessageEndEvent) => { endCount++; },
        onError: (_ev: SSEErrorEvent) => { errCount++; }
      };

      SseClient.dispatchBlock('data: {"event":"workflow_started","workflow_run_id":"w1"}\ndata: {"event":"workflow_finished","workflow_run_id":"w1"}\n\n', cbs);

      expect(msgCount).assertEqual(0);
      expect(endCount).assertEqual(0);
      expect(errCount).assertEqual(0);
    });

    it('dispatchBlock handles multi data line block independently', 0, () => {
      let msgCount = 0;
      let endCount = 0;
      let errCount = 0;

      const cbs: SseCallbacks = {
        onMessage: (_ev: SSEMessageEvent) => { msgCount++; },
        onMessageEnd: (_ev: SSEMessageEndEvent) => { endCount++; },
        onError: (_ev: SSEErrorEvent) => { errCount++; }
      };

      SseClient.dispatchBlock('data: {"event":"message","answer":"a"}\ndata: {"event":"error","code":"ERR"}\n\n', cbs);

      expect(msgCount).assertEqual(1);
      expect(endCount).assertEqual(0);
      expect(errCount).assertEqual(1);
    });

    it('dispatchBlock skips invalid JSON without throwing', 0, () => {
      let msgCount = 0;
      let endCount = 0;
      let errCount = 0;

      const cbs: SseCallbacks = {
        onMessage: (_ev: SSEMessageEvent) => { msgCount++; },
        onMessageEnd: (_ev: SSEMessageEndEvent) => { endCount++; },
        onError: (_ev: SSEErrorEvent) => { errCount++; }
      };

      SseClient.dispatchBlock('data: {invalid}\n\n', cbs);

      expect(msgCount).assertEqual(0);
      expect(endCount).assertEqual(0);
      expect(errCount).assertEqual(0);
    });

    it('dispatchBlock skips lines without data prefix', 0, () => {
      let msgCount = 0;
      let endCount = 0;
      let errCount = 0;

      const cbs: SseCallbacks = {
        onMessage: (_ev: SSEMessageEvent) => { msgCount++; },
        onMessageEnd: (_ev: SSEMessageEndEvent) => { endCount++; },
        onError: (_ev: SSEErrorEvent) => { errCount++; }
      };

      SseClient.dispatchBlock('event: message\n\n', cbs);

      expect(msgCount).assertEqual(0);
      expect(endCount).assertEqual(0);
      expect(errCount).assertEqual(0);
    });

    it('dispatchBlock silently ignores agent_message and agent_thought events', 0, () => {
      let msgCount = 0;
      let endCount = 0;
      let errCount = 0;

      const cbs: SseCallbacks = {
        onMessage: (_ev: SSEMessageEvent) => { msgCount++; },
        onMessageEnd: (_ev: SSEMessageEndEvent) => { endCount++; },
        onError: (_ev: SSEErrorEvent) => { errCount++; }
      };

      SseClient.dispatchBlock('data: {"event":"agent_message","answer":"hi","conversation_id":"c1"}\ndata: {"event":"agent_thought","thought":"thinking","tool":null}\n\n', cbs);

      expect(msgCount).assertEqual(0);
      expect(endCount).assertEqual(0);
      expect(errCount).assertEqual(0);
    });

    it('dispatchBlock skips empty block without throwing', 0, () => {
      let msgCount = 0;
      let endCount = 0;
      let errCount = 0;

      const cbs: SseCallbacks = {
        onMessage: (_ev: SSEMessageEvent) => { msgCount++; },
        onMessageEnd: (_ev: SSEMessageEndEvent) => { endCount++; },
        onError: (_ev: SSEErrorEvent) => { errCount++; }
      };

      SseClient.dispatchBlock('', cbs);
      SseClient.dispatchBlock('   \n  \n\n', cbs);

      expect(msgCount).assertEqual(0);
      expect(endCount).assertEqual(0);
      expect(errCount).assertEqual(0);
    });

    it('dispatchBlock never invokes onComplete', 0, () => {
      let msgCount = 0;
      let completeCount = 0;

      const cbs: SseCallbacks = {
        onMessage: (_ev: SSEMessageEvent) => { msgCount++; },
        onComplete: () => { completeCount++; }
      };

      SseClient.dispatchBlock('data: {"event":"message","answer":"ok","conversation_id":"c1","message_id":"m1","created_at":1}\n\n', cbs);

      expect(msgCount).assertEqual(1);
      expect(completeCount).assertEqual(0);
    });

    it('destroy is idempotent with null req', 0, () => {
      const client = new SseClient({
        tokenProvider: () => 't',
        callbacks: {}
      });
      client.destroy();
      client.destroy();
      expect(client !== null).assertTrue();
    });
  });
}
