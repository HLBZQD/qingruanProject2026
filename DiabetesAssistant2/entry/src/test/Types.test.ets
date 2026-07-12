import { describe, it, expect } from '@ohos/hypium';
import { User, PunchRecord, PunchType, PlanType, CompletionStatus,
         UserProfile, ArticleDetail, DoctorDetail } from '../main/ets/types/models';
import { ChatMessage, SseEventType } from '../main/ets/types/sse';
import { ApiError, ApiErrorBody } from '../main/ets/types/api';

export default function typesTest(): void {
  describe('TypesTest', () => {
    it('User literal field access', 0, () => {
      const u: User = { id: 1, username: 'a', role: 'user', avatar: null };
      expect(u.role).assertEqual('user');
      expect(u.avatar).assertNull();
    });

    it('PunchRecord literal field access', 0, () => {
      const p: PunchRecord = { id: 1, plan_id: null, plan_title: null, punch_type: 'diet', completion_status: 'completed', remarks: '', punch_time: '2026-07-01' };
      expect(p.punch_type).assertEqual('diet');
      expect(p.completion_status).assertEqual('completed');
      expect(p.plan_id).assertNull();
    });

    it('literal union const assignment', 0, () => {
      const DIET: PunchType = 'diet';
      const OTHER_PLAN: PlanType = 'other';
      const EVT_MSG: SseEventType = 'message';
      const EVT_END: SseEventType = 'message_end';
      const EVT_ERR: SseEventType = 'error';
      const COMPLETED: CompletionStatus = 'completed';
      expect(DIET).assertEqual('diet');
      expect(OTHER_PLAN).assertEqual('other');
      expect(EVT_MSG).assertEqual('message');
      expect(EVT_END).assertEqual('message_end');
      expect(EVT_ERR).assertEqual('error');
      expect(COMPLETED).assertEqual('completed');
    });

    it('ChatMessage literal field access', 0, () => {
      const m: ChatMessage = { id: '1', role: 'user', content: 'hi', timestamp: 0, mode: 'doctor' };
      expect(m.mode).assertEqual('doctor');
    });

    it('UserProfile extends chain', 0, () => {
      const up: UserProfile = { id: 2, username: 'b', role: 'user', avatar: null, created_at: '2026-01-01' };
      expect(up.created_at).assertEqual('2026-01-01');
      expect(up.id).assertEqual(2);
    });

    it('ArticleDetail extends chain', 0, () => {
      const ad: ArticleDetail = { id: 3, title: 't', cover: null, author: 'a', category: 'c', tags: [], summary: 's', views: 0, created_at: '2026-01-02', content: 'body', is_collected: true };
      expect(ad.content).assertEqual('body');
      expect(ad.is_collected).assertTrue();
      expect(ad.title).assertEqual('t');
    });

    it('DoctorDetail extends chain', 0, () => {
      const dd: DoctorDetail = { id: 4, name: 'd', department: 'dep', title: 't', description: 'x', avatar: null, is_online: true };
      expect(dd.is_online).assertTrue();
      expect(dd.name).assertEqual('d');
    });

    it('ApiError / ApiErrorBody construction & field access', 0, () => {
      const ab: ApiErrorBody = { code: 'ERR', message: 'msg' };
      expect(ab.code).assertEqual('ERR');
      const ae: ApiError = new ApiError('client', 'msg', 400, 'ERR');
      expect(ae.kind).assertEqual('client');
      expect(ae.message).assertEqual('msg');
      expect(ae.status).assertEqual(400);
      expect(ae.code).assertEqual('ERR');
    });
  });
}
