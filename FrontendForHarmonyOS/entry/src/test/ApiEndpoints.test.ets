import { describe, it, expect } from '@ohos/hypium';
import * as API from '../main/ets/common/constants/ApiEndpoints';

export default function apiEndpointsTest(): void {
  describe('ApiEndpointsTest', () => {
    const STATIC_NAMES: string[] = [
      'API_AUTH_LOGIN', 'API_AUTH_REGISTER', 'API_AUTH_LOGOUT',
      'API_USER_PROFILE', 'API_USER_PASSWORD',
      'API_RISK_PREDICT', 'API_RISK_HISTORY',
      'API_DOCTORS',
      'API_PLAN_GENERATE', 'API_PLAN_ADJUST', 'API_PLAN_CURRENT',
      'API_PUNCH', 'API_PUNCH_LIST', 'API_PUNCH_ANALYSIS',
      'API_ARTICLES', 'API_ARTICLES_GENERATE', 'API_ARTICLES_COLLECTIONS',
      'API_DIABETES_TYPES',
      'API_ASSISTANT_CHAT', 'API_ASSISTANT_ADVICE', 'API_ASSISTANT_CONVERSATIONS',
      'API_ADMIN_CHAT', 'API_ADMIN_EXECUTE', 'API_ADMIN_LOGS',
      'API_UPLOAD_AVATAR'
    ];

    const FUNCTION_NAMES: string[] = [
      'API_DOCTORS_ID', 'API_CHAT_DOCTOR_ID', 'API_CHAT_DOCTOR_ID_CONVERSATIONS',
      'API_ARTICLES_ID', 'API_ARTICLES_COLLECT', 'API_DIABETES_TYPES_ID',
      'API_DIFY_WORKFLOW_ID', 'API_DIFY_AGENT_ID'
    ];

    const ALL_NAMES: string[] = [...STATIC_NAMES, ...FUNCTION_NAMES];

    it('all constants importable and not undefined/null', 0, () => {
      ALL_NAMES.forEach(name => {
        expect(API[name]).assertNotNull();
        expect(API[name] !== undefined).assertTrue();
      });
      FUNCTION_NAMES.forEach(name => {
        expect(typeof API[name]).assertEqual('function');
      });
    });

    it('all static string constants start with /api/', 0, () => {
      STATIC_NAMES.forEach(name => {
        expect((API[name] as string).startsWith('/api/')).assertTrue();
      });
    });

    it('spot-check static constants equal expected values', 0, () => {
      expect(API.API_AUTH_LOGIN).assertEqual('/api/auth/login');
      expect(API.API_PLAN_GENERATE).assertEqual('/api/plan/generate');
      expect(API.API_UPLOAD_AVATAR).assertEqual('/api/upload/avatar');
      expect(API.API_PUNCH_ANALYSIS).assertEqual('/api/punch/analysis');
      expect(API.API_RISK_PREDICT).assertEqual('/api/risk/predict');
    });

    it('function-type constants return correct templated paths', 0, () => {
      expect(API.API_DOCTORS_ID(5)).assertEqual('/api/doctors/5');
      expect(API.API_CHAT_DOCTOR_ID(3)).assertEqual('/api/chat/doctor/3');
      expect(API.API_ARTICLES_ID(42)).assertEqual('/api/articles/42');
      expect(API.API_ARTICLES_COLLECT(7)).assertEqual('/api/articles/7/collect');
      expect(API.API_DIABETES_TYPES_ID(1)).assertEqual('/api/diabetes-types/1');
      expect(API.API_CHAT_DOCTOR_ID_CONVERSATIONS(10)).assertEqual('/api/chat/doctor/10/conversations');
      expect(API.API_DIFY_WORKFLOW_ID('wf-abc-123')).assertEqual('/api/dify/workflow/wf-abc-123');
      expect(API.API_DIFY_AGENT_ID('agent-xyz')).assertEqual('/api/dify/agent/agent-xyz');
    });

    it('function-type constants return string (type safety)', 0, () => {
      expect(typeof API.API_DOCTORS_ID(1)).assertEqual('string');
      expect(typeof API.API_CHAT_DOCTOR_ID(1)).assertEqual('string');
      expect(typeof API.API_CHAT_DOCTOR_ID_CONVERSATIONS(1)).assertEqual('string');
      expect(typeof API.API_ARTICLES_ID(1)).assertEqual('string');
      expect(typeof API.API_ARTICLES_COLLECT(1)).assertEqual('string');
      expect(typeof API.API_DIABETES_TYPES_ID(1)).assertEqual('string');
      expect(typeof API.API_DIFY_WORKFLOW_ID('x')).assertEqual('string');
      expect(typeof API.API_DIFY_AGENT_ID('x')).assertEqual('string');
      expect(API.API_DOCTORS_ID(0)).assertEqual('/api/doctors/0');
    });
  });
}
