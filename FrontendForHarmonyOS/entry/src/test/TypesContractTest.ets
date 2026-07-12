import { describe, it, expect } from '@ohos/hypium';
// R3 types 数据契约层（types/{models,sse,api}.ets）行为契约测试。
// 本层 0 行为（纯 interface / type 别名），detail_v3「错误处理」段明文「本层无运行时错误」，
// 故「错误用例」维度按纯数据层语义解释为：
//   (a) D1 可空字段 null 语义保持（assertNull）；
//   (b) D3 具名嵌套 interface 深层字段可达；
//   (c) 字面量联合出口穷举值赋值通过类型检查（编译期断言，运行时恒等于赋值字面量）。
// D1/D2/D3/D4 降级约定（detail_v3「ArkTS 降级约定」段）由本套件用例固化：
//   D1 可空字段 `| null` 必填、D2 不做 discriminated union（SseEventType 出口 + SSEDispatchEvent envelope）、
//   D3 内联匿名 interface 抽具名、D4 import/export 不带 `type` 关键字（含 api.ets re-export）。
// assembleHap 编译通过为唯一验收门（沿用 R1/R2 退化方案，运行时用例不执行）。
import {
  User, UserProfile, AdminLog, Doctor, DoctorDetail,
  Article, ArticleDetail, DiabetesType, DiabetesTypeDetail,
  LifePlan, PunchRecord,
  PlanType, PunchType, CompletionStatus,
} from '../main/ets/types/models';
import {
  SseEventType, SSEMessageEvent, SSEMessageEndEvent, SSEErrorEvent,
  SSEWorkflowStartedEvent, SSEWorkflowFinishedEvent, SSEAgentMessageEvent,
  SSEAgentThoughtEvent, SSEDispatchEvent, ChatMessage, ConversationHistoryItem,
} from '../main/ets/types/sse';
import {
  ApiErrorBody, ApiError, PaginationParams, PaginationInfo,
  LoginRequest, RegisterRequest, LoginResponse, UpdateProfileRequest,
  ChangePasswordRequest, RiskPredictRequest, RiskPredictResponse, RiskHistoryItem,
  CollectedArticle, ArticleGenerateCategoryItem, ArticleGenerateCategorySelection,
  PlanGenerateRequestHealthInfo, PlanGenerateRequestPreferences, PlanGenerateRequest,
  PlanAdjustRequest, PlanResponse, PlanCurrentResponse, PunchCreateRequest,
  PunchCreateResponse, PunchListParams, PunchAnalysisTrendDay, PunchAnalysisResponse,
  // D4 re-export 验证：HealthAdvice 自 api.ets re-export 的 models 具名清单导入
  //（与上方 models 直 import 解耦，验证 api.ets re-export 出口对消费侧可用，不带 `type` 关键字）
  HealthAdvice,
} from '../main/ets/types/api';

export default function typesContractTest(): void {
  describe('TypesContractTest', () => {

    // ==================== models.ets: 字面量联合 / 单类型 type 别名 ====================
    describe('ModelsLiteralUnions', () => {
      // 正向 + 边界（穷举）：PlanType 三值
      it('PlanType accepts all 3 declared literals (positive + boundary exhaustive)', 0, () => {
        const a: PlanType = 'diet';
        const b: PlanType = 'exercise';
        const c: PlanType = 'other';
        expect(a).assertEqual('diet');
        expect(b).assertEqual('exercise');
        expect(c).assertEqual('other');
      });
      // 正向 + 边界（穷举）：PunchType 两值
      it('PunchType accepts both declared literals (positive + boundary exhaustive)', 0, () => {
        const a: PunchType = 'diet';
        const b: PunchType = 'exercise';
        expect(a).assertEqual('diet');
        expect(b).assertEqual('exercise');
      });
      // 正向 + 边界（穷举）：CompletionStatus 两值
      it('CompletionStatus accepts both declared literals (positive + boundary exhaustive)', 0, () => {
        const a: CompletionStatus = 'completed';
        const b: CompletionStatus = 'uncompleted';
        expect(a).assertEqual('completed');
        expect(b).assertEqual('uncompleted');
      });
      // 正向：DiabetesTypeDetail 单类型 alias 构造 DiabetesType 形态；错误维度：D1 image null 保持
      it('DiabetesTypeDetail alias constructs DiabetesType shape (positive + D1 image null)', 0, () => {
        const d: DiabetesTypeDetail = {
          id: 1, name: '2型', image: null,
          pathogenesis: 'p', manifestation: 'm', treatment: 't',
        };
        expect(d.id).assertEqual(1);
        expect(d.name).assertEqual('2型');
        expect(d.pathogenesis).assertEqual('p');
        expect(d.manifestation).assertEqual('m');
        expect(d.treatment).assertEqual('t');
        expect(d.image).assertNull();
      });
    });

    // ==================== models.ets: interface 字段契约 ====================
    describe('ModelsInterfaces', () => {
      // User：正向 + D1 avatar null（错误维度）
      it('User positive + D1 avatar null preserved', 0, () => {
        const u: User = { id: 1, username: 'a', role: 'user', avatar: null };
        expect(u.id).assertEqual(1);
        expect(u.username).assertEqual('a');
        expect(u.role).assertEqual('user');
        expect(u.avatar).assertNull();
      });
      // User：边界 role='admin' + avatar 非空字符串
      it('User boundary role admin + avatar non-null string', 0, () => {
        const u: User = { id: 2, username: 'b', role: 'admin', avatar: 'https://x/a.png' };
        expect(u.role).assertEqual('admin');
        expect(u.avatar).assertEqual('https://x/a.png');
      });

      // UserProfile extends User：正向 + extends 链叠加（base id + derived created_at 同可达）+ D1 avatar null
      it('UserProfile extends User: base + derived fields co-reachable (positive + D1 null)', 0, () => {
        const up: UserProfile = {
          id: 2, username: 'b', role: 'user', avatar: null, created_at: '2026-01-01',
        };
        expect(up.id).assertEqual(2);
        expect(up.username).assertEqual('b');
        expect(up.role).assertEqual('user');
        expect(up.avatar).assertNull();
        expect(up.created_at).assertEqual('2026-01-01');
      });

      // AdminLog：正向
      it('AdminLog positive', 0, () => {
        const a: AdminLog = {
          id: 1, operator_id: 9, operator_username: 'admin',
          operation_type: 'INSERT', operation_content: 'c', operation_result: 'r',
          operation_time: '2026-07-01 10:00:00',
        };
        expect(a.id).assertEqual(1);
        expect(a.operator_id).assertEqual(9);
        expect(a.operation_type).assertEqual('INSERT');
        expect(a.operation_content).assertEqual('c');
      });
      // AdminLog：边界 operation_type 四值穷举（detail_v3 收敛为纯四值枚举）
      it('AdminLog operation_type boundary: all 4 declared literals', 0, () => {
        const ins: AdminLog = { id: 1, operator_id: 1, operator_username: 'x', operation_type: 'INSERT', operation_content: 'c', operation_result: 'r', operation_time: 't' };
        const upd: AdminLog = { id: 2, operator_id: 1, operator_username: 'x', operation_type: 'UPDATE', operation_content: 'c', operation_result: 'r', operation_time: 't' };
        const del: AdminLog = { id: 3, operator_id: 1, operator_username: 'x', operation_type: 'DELETE', operation_content: 'c', operation_result: 'r', operation_time: 't' };
        const sel: AdminLog = { id: 4, operator_id: 1, operator_username: 'x', operation_type: 'SELECT', operation_content: 'c', operation_result: 'r', operation_time: 't' };
        expect(ins.operation_type).assertEqual('INSERT');
        expect(upd.operation_type).assertEqual('UPDATE');
        expect(del.operation_type).assertEqual('DELETE');
        expect(sel.operation_type).assertEqual('SELECT');
      });

      // Doctor：正向 + D1 avatar null
      it('Doctor positive + D1 avatar null preserved', 0, () => {
        const d: Doctor = { id: 1, name: '张', department: '内分泌科', title: '主任', description: 'desc', avatar: null };
        expect(d.id).assertEqual(1);
        expect(d.name).assertEqual('张');
        expect(d.department).assertEqual('内分泌科');
        expect(d.title).assertEqual('主任');
        expect(d.description).assertEqual('desc');
        expect(d.avatar).assertNull();
      });
      // Doctor：边界 avatar 非空
      it('Doctor boundary avatar non-null string', 0, () => {
        const d: Doctor = { id: 2, name: '李', department: 'd', title: 't', description: 'x', avatar: 'https://x/d.png' };
        expect(d.avatar).assertEqual('https://x/d.png');
      });

      // DoctorDetail extends Doctor：extends 链叠加 + D1 avatar null
      it('DoctorDetail extends Doctor: base + derived fields co-reachable (positive + D1 null)', 0, () => {
        const dd: DoctorDetail = {
          id: 4, name: 'd', department: 'dep', title: 't', description: 'x',
          avatar: null, is_online: true,
        };
        expect(dd.id).assertEqual(4);
        expect(dd.name).assertEqual('d');
        expect(dd.department).assertEqual('dep');
        expect(dd.title).assertEqual('t');
        expect(dd.description).assertEqual('x');
        expect(dd.avatar).assertNull();
        expect(dd.is_online).assertTrue();
      });
      // DoctorDetail：边界 is_online=false
      it('DoctorDetail boundary is_online false', 0, () => {
        const dd: DoctorDetail = { id: 5, name: 'n', department: 'd', title: 't', description: 'x', avatar: null, is_online: false };
        expect(dd.is_online).assertFalse();
      });

      // Article：正向 + D1 cover null + tags 非空
      it('Article positive + D1 cover null + tags non-empty', 0, () => {
        const a: Article = {
          id: 1, title: 't', cover: null, author: 'a', category: 'c',
          tags: ['糖尿病', '饮食'], summary: 's', views: 0, created_at: '2026-01-02',
        };
        expect(a.id).assertEqual(1);
        expect(a.title).assertEqual('t');
        expect(a.cover).assertNull();
        expect(a.tags.length).assertEqual(2);
        expect(a.tags[0]).assertEqual('糖尿病');
        expect(a.views).assertEqual(0);
      });
      // Article：边界 tags 空数组 + cover 非空
      it('Article boundary tags empty array + cover non-null', 0, () => {
        const a: Article = { id: 2, title: 't', cover: 'https://x/c.png', author: 'a', category: 'c', tags: [], summary: 's', views: 100, created_at: '2026-01-02' };
        expect(a.tags.length).assertEqual(0);
        expect(a.cover).assertEqual('https://x/c.png');
        expect(a.views).assertEqual(100);
      });

      // ArticleDetail extends Article：extends 链叠加 + D1 cover null + tags 空数组边界
      it('ArticleDetail extends Article: base + derived fields co-reachable (positive + D1 null + empty tags)', 0, () => {
        const ad: ArticleDetail = {
          id: 3, title: 't', cover: null, author: 'a', category: 'c', tags: [],
          summary: 's', views: 0, created_at: '2026-01-02', content: 'body', is_collected: true,
        };
        expect(ad.id).assertEqual(3);
        expect(ad.title).assertEqual('t');
        expect(ad.cover).assertNull();
        expect(ad.tags.length).assertEqual(0);
        expect(ad.content).assertEqual('body');
        expect(ad.is_collected).assertTrue();
      });
      // ArticleDetail：边界 is_collected=false + tags 非空
      it('ArticleDetail boundary is_collected false + tags non-empty', 0, () => {
        const ad: ArticleDetail = { id: 4, title: 't', cover: null, author: 'a', category: 'c', tags: ['x'], summary: 's', views: 1, created_at: '2026-01-02', content: 'b', is_collected: false };
        expect(ad.is_collected).assertFalse();
        expect(ad.tags[0]).assertEqual('x');
      });

      // DiabetesType：正向 + D1 image null
      it('DiabetesType positive + D1 image null preserved', 0, () => {
        const dt: DiabetesType = {
          id: 1, name: '1型', image: null, pathogenesis: 'p',
          manifestation: 'm', treatment: 't',
        };
        expect(dt.id).assertEqual(1);
        expect(dt.name).assertEqual('1型');
        expect(dt.image).assertNull();
        expect(dt.pathogenesis).assertEqual('p');
        expect(dt.manifestation).assertEqual('m');
        expect(dt.treatment).assertEqual('t');
      });
      // DiabetesType：边界 image 非空
      it('DiabetesType boundary image non-null string', 0, () => {
        const dt: DiabetesType = { id: 2, name: '2型', image: 'https://x/d.png', pathogenesis: 'p', manifestation: 'm', treatment: 't' };
        expect(dt.image).assertEqual('https://x/d.png');
      });

      // LifePlan：正向
      it('LifePlan positive', 0, () => {
        const lp: LifePlan = {
          id: 1, plan_type: 'diet', order_num: 1, time_desc: '早餐',
          title: '低糖早餐', content: '全麦面包+鸡蛋',
        };
        expect(lp.id).assertEqual(1);
        expect(lp.plan_type).assertEqual('diet');
        expect(lp.order_num).assertEqual(1);
        expect(lp.title).assertEqual('低糖早餐');
        expect(lp.content).assertEqual('全麦面包+鸡蛋');
      });
      // LifePlan：边界 plan_type 三值穷举（引用本文件 PlanType 联合）
      it('LifePlan plan_type boundary: all 3 PlanType values', 0, () => {
        const d: LifePlan = { id: 1, plan_type: 'diet', order_num: 1, time_desc: 't', title: 'a', content: 'c' };
        const e: LifePlan = { id: 2, plan_type: 'exercise', order_num: 2, time_desc: 't', title: 'b', content: 'c' };
        const o: LifePlan = { id: 3, plan_type: 'other', order_num: 3, time_desc: 't', title: 'c', content: 'c' };
        expect(d.plan_type).assertEqual('diet');
        expect(e.plan_type).assertEqual('exercise');
        expect(o.plan_type).assertEqual('other');
      });

      // HealthAdvice：正向 + tags 非空
      it('HealthAdvice positive + tags non-empty', 0, () => {
        const h: HealthAdvice = { id: 1, title: 't', tags: ['饮食'], content: 'c', created_at: '2026-01-03' };
        expect(h.id).assertEqual(1);
        expect(h.title).assertEqual('t');
        expect(h.tags.length).assertEqual(1);
        expect(h.tags[0]).assertEqual('饮食');
        expect(h.content).assertEqual('c');
        expect(h.created_at).assertEqual('2026-01-03');
      });
      // HealthAdvice：边界 tags 空数组
      it('HealthAdvice boundary tags empty array', 0, () => {
        const h: HealthAdvice = { id: 2, title: 't', tags: [], content: 'c', created_at: '2026-01-03' };
        expect(h.tags.length).assertEqual(0);
      });

      // PunchRecord：正向 + D1 plan_id/plan_title null（错误维度）+ punch_type/completion_status 字面量
      it('PunchRecord positive + D1 plan_id/plan_title null preserved', 0, () => {
        const p: PunchRecord = {
          id: 1, plan_id: null, plan_title: null, punch_type: 'diet',
          completion_status: 'completed', remarks: '', punch_time: '2026-07-01 08:00:00',
        };
        expect(p.id).assertEqual(1);
        expect(p.plan_id).assertNull();
        expect(p.plan_title).assertNull();
        expect(p.punch_type).assertEqual('diet');
        expect(p.completion_status).assertEqual('completed');
        expect(p.remarks).assertEqual('');
        expect(p.punch_time).assertEqual('2026-07-01 08:00:00');
      });
      // PunchRecord：边界 plan_id/plan_title 非空 + punch_type='exercise' + completion_status='uncompleted'
      it('PunchRecord boundary non-null plan refs + exercise/uncompleted', 0, () => {
        const p: PunchRecord = {
          id: 2, plan_id: 5, plan_title: '跑步', punch_type: 'exercise',
          completion_status: 'uncompleted', remarks: '太累', punch_time: '2026-07-01 20:00:00',
        };
        expect(p.plan_id).assertEqual(5);
        expect(p.plan_title).assertEqual('跑步');
        expect(p.punch_type).assertEqual('exercise');
        expect(p.completion_status).assertEqual('uncompleted');
        expect(p.remarks).assertEqual('太累');
      });
    });

    // ==================== sse.ets: 字面量联合出口 + SSE 事件 + envelope + Chat ====================
    describe('Sse', () => {
      // SseEventType：正向 + 边界（7 值穷举，D2 出口可用）
      it('SseEventType accepts all 7 declared literals (positive + boundary exhaustive, D2 outlet)', 0, () => {
        const a: SseEventType = 'message';
        const b: SseEventType = 'message_end';
        const c: SseEventType = 'error';
        const d: SseEventType = 'workflow_started';
        const e: SseEventType = 'workflow_finished';
        const f: SseEventType = 'agent_message';
        const g: SseEventType = 'agent_thought';
        expect(a).assertEqual('message');
        expect(b).assertEqual('message_end');
        expect(c).assertEqual('error');
        expect(d).assertEqual('workflow_started');
        expect(e).assertEqual('workflow_finished');
        expect(f).assertEqual('agent_message');
        expect(g).assertEqual('agent_thought');
      });

      // SSEMessageEvent：正向
      it('SSEMessageEvent positive', 0, () => {
        const ev: SSEMessageEvent = {
          event: 'message', answer: 'hello', conversation_id: 'c1',
          message_id: 'm1', created_at: 1719720000,
        };
        expect(ev.event).assertEqual('message');
        expect(ev.answer).assertEqual('hello');
        expect(ev.conversation_id).assertEqual('c1');
        expect(ev.message_id).assertEqual('m1');
        expect(ev.created_at).assertEqual(1719720000);
      });
      // SSEMessageEndEvent：正向
      it('SSEMessageEndEvent positive', 0, () => {
        const ev: SSEMessageEndEvent = {
          event: 'message_end', conversation_id: 'c1', message_id: 'm1', created_at: 1719720001,
        };
        expect(ev.event).assertEqual('message_end');
        expect(ev.conversation_id).assertEqual('c1');
        expect(ev.message_id).assertEqual('m1');
        expect(ev.created_at).assertEqual(1719720001);
      });
      // SSEErrorEvent：正向
      it('SSEErrorEvent positive', 0, () => {
        const ev: SSEErrorEvent = { event: 'error', message: 'boom', code: '500' };
        expect(ev.event).assertEqual('error');
        expect(ev.message).assertEqual('boom');
        expect(ev.code).assertEqual('500');
      });
      // SSEWorkflowStartedEvent：正向
      it('SSEWorkflowStartedEvent positive', 0, () => {
        const ev: SSEWorkflowStartedEvent = { event: 'workflow_started', workflow_run_id: 'w1' };
        expect(ev.event).assertEqual('workflow_started');
        expect(ev.workflow_run_id).assertEqual('w1');
      });
      // SSEWorkflowFinishedEvent：正向
      it('SSEWorkflowFinishedEvent positive', 0, () => {
        const ev: SSEWorkflowFinishedEvent = { event: 'workflow_finished', workflow_run_id: 'w1' };
        expect(ev.event).assertEqual('workflow_finished');
        expect(ev.workflow_run_id).assertEqual('w1');
      });
      // SSEAgentMessageEvent：正向
      it('SSEAgentMessageEvent positive', 0, () => {
        const ev: SSEAgentMessageEvent = { event: 'agent_message', answer: 'ans', conversation_id: 'c2' };
        expect(ev.event).assertEqual('agent_message');
        expect(ev.answer).assertEqual('ans');
        expect(ev.conversation_id).assertEqual('c2');
      });
      // SSEAgentThoughtEvent：正向 + D1 tool null（错误维度）
      it('SSEAgentThoughtEvent positive + D1 tool null preserved', 0, () => {
        const ev: SSEAgentThoughtEvent = { event: 'agent_thought', thought: 'thinking', tool: null };
        expect(ev.event).assertEqual('agent_thought');
        expect(ev.thought).assertEqual('thinking');
        expect(ev.tool).assertNull();
      });
      // SSEAgentThoughtEvent：边界 tool 非空
      it('SSEAgentThoughtEvent boundary tool non-null string', 0, () => {
        const ev: SSEAgentThoughtEvent = { event: 'agent_thought', thought: 't', tool: 'search' };
        expect(ev.tool).assertEqual('search');
      });

      // SSEDispatchEvent envelope（D2 对象层降级替代）：正向 event=SseEventType + payload 携带强类型 SSE 事件
      it('SSEDispatchEvent envelope positive: event outlet + typed payload (D2 degradation)', 0, () => {
        const msg: SSEMessageEvent = {
          event: 'message', answer: 'hi', conversation_id: 'c1',
          message_id: 'm1', created_at: 0,
        };
        const disp: SSEDispatchEvent = { event: 'message', payload: msg };
        expect(disp.event).assertEqual('message');
        expect(disp.payload).assertNotNull();
      });
      // SSEDispatchEvent：边界 event 取其他 SseEventType 值（验证 envelope 通用路由出口）
      // payload 用强类型 SSE 事件对象赋值给 ESObject（ESObject 为 ArkTS 通用顶类型，接受强类型值）
      it('SSEDispatchEvent boundary event across SseEventType values', 0, () => {
        const endEv: SSEMessageEndEvent = { event: 'message_end', conversation_id: 'c', message_id: 'm', created_at: 0 };
        const errEv: SSEErrorEvent = { event: 'error', message: 'msg', code: '500' };
        const d1: SSEDispatchEvent = { event: 'message_end', payload: endEv };
        const d2: SSEDispatchEvent = { event: 'error', payload: errEv };
        const d3: SSEDispatchEvent = { event: 'workflow_started', payload: endEv };
        expect(d1.event).assertEqual('message_end');
        expect(d2.event).assertEqual('error');
        expect(d3.event).assertEqual('workflow_started');
      });

      // ChatMessage：正向 + mode='doctor'
      it('ChatMessage positive + mode doctor', 0, () => {
        const m: ChatMessage = { id: '1', role: 'user', content: 'hi', timestamp: 0, mode: 'doctor' };
        expect(m.id).assertEqual('1');
        expect(m.role).assertEqual('user');
        expect(m.content).assertEqual('hi');
        expect(m.timestamp).assertEqual(0);
        expect(m.mode).assertEqual('doctor');
      });
      // ChatMessage：D1 mode null（错误维度）+ 边界 role='assistant' + mode='admin'/'assistant'
      it('ChatMessage D1 mode null + boundary role assistant / mode admin/assistant', 0, () => {
        const a: ChatMessage = { id: '2', role: 'assistant', content: 'c', timestamp: 1, mode: null };
        const b: ChatMessage = { id: '3', role: 'user', content: 'c', timestamp: 2, mode: 'assistant' };
        const c: ChatMessage = { id: '4', role: 'user', content: 'c', timestamp: 3, mode: 'admin' };
        expect(a.mode).assertNull();
        expect(a.role).assertEqual('assistant');
        expect(b.mode).assertEqual('assistant');
        expect(c.mode).assertEqual('admin');
      });

      // ConversationHistoryItem：正向
      it('ConversationHistoryItem positive', 0, () => {
        const it2: ConversationHistoryItem = { conversation_id: 'c1', name: '会话1', created_at: '2026-07-01' };
        expect(it2.conversation_id).assertEqual('c1');
        expect(it2.name).assertEqual('会话1');
        expect(it2.created_at).assertEqual('2026-07-01');
      });
    });

    // ==================== api.ets: D4 re-export + interface 字段契约 ====================
    describe('Api', () => {
      // D4 re-export 验证：HealthAdvice 自 api.ets re-export 的 models 具名清单导入并构造
      //（消费侧 import re-export 类型不带 `type` 关键字，验证 re-export 出口可用）
      it('D4 re-export: HealthAdvice constructible from api.ets re-export', 0, () => {
        const h: HealthAdvice = { id: 1, title: 't', tags: ['饮食'], content: 'c', created_at: '2026-07-01' };
        expect(h.id).assertEqual(1);
        expect(h.title).assertEqual('t');
        expect(h.tags.length).assertEqual(1);
        expect(h.tags[0]).assertEqual('饮食');
        expect(h.content).assertEqual('c');
        expect(h.created_at).assertEqual('2026-07-01');
      });

      // ApiErrorBody + ApiError：D3 具名嵌套 + 深层字段可达（错误维度）
      it('ApiErrorBody + ApiError positive + D3 nested deep field access', 0, () => {
        const ab: ApiErrorBody = { code: 'ERR_AUTH', message: 'invalid token' };
        expect(ab.code).assertEqual('ERR_AUTH');
        expect(ab.message).assertEqual('invalid token');
        const ae: ApiError = { error: ab };
        expect(ae.error.code).assertEqual('ERR_AUTH');
        expect(ae.error.message).assertEqual('invalid token');
      });

      // PaginationParams：正向
      it('PaginationParams positive', 0, () => {
        const p: PaginationParams = { page: 1, pageSize: 20 };
        expect(p.page).assertEqual(1);
        expect(p.pageSize).assertEqual(20);
      });
      // PaginationInfo：正向
      it('PaginationInfo positive', 0, () => {
        const p: PaginationInfo = { page: 1, pageSize: 20, total: 100, totalPages: 5 };
        expect(p.page).assertEqual(1);
        expect(p.pageSize).assertEqual(20);
        expect(p.total).assertEqual(100);
        expect(p.totalPages).assertEqual(5);
      });

      // LoginRequest：正向
      it('LoginRequest positive', 0, () => {
        const r: LoginRequest = { username: 'u', password: 'p' };
        expect(r.username).assertEqual('u');
        expect(r.password).assertEqual('p');
      });
      // RegisterRequest：正向
      it('RegisterRequest positive', 0, () => {
        const r: RegisterRequest = { username: 'u', password: 'p' };
        expect(r.username).assertEqual('u');
        expect(r.password).assertEqual('p');
      });

      // LoginResponse：正向 + 嵌套 User + role='admin' 边界
      it('LoginResponse positive + nested User + role admin boundary', 0, () => {
        const u: User = { id: 1, username: 'a', role: 'admin', avatar: null };
        const r: LoginResponse = {
          token: 'tok', role: 'admin', user: u, must_change_password: false,
        };
        expect(r.token).assertEqual('tok');
        expect(r.role).assertEqual('admin');
        expect(r.user.id).assertEqual(1);
        expect(r.user.username).assertEqual('a');
        expect(r.must_change_password).assertFalse();
      });
      // LoginResponse：D1 must_change_password null（错误维度）
      it('LoginResponse D1 must_change_password null preserved', 0, () => {
        const u: User = { id: 2, username: 'b', role: 'user', avatar: null };
        const r: LoginResponse = {
          token: 't', role: 'user', user: u, must_change_password: null,
        };
        expect(r.must_change_password).assertNull();
      });

      // UpdateProfileRequest：D1 username/avatar null（错误维度）
      it('UpdateProfileRequest D1 username/avatar null preserved', 0, () => {
        const r: UpdateProfileRequest = { username: null, avatar: null };
        expect(r.username).assertNull();
        expect(r.avatar).assertNull();
      });
      // UpdateProfileRequest：边界 username/avatar 非空
      it('UpdateProfileRequest boundary username/avatar non-null', 0, () => {
        const r: UpdateProfileRequest = { username: 'newname', avatar: 'https://x/a.png' };
        expect(r.username).assertEqual('newname');
        expect(r.avatar).assertEqual('https://x/a.png');
      });

      // ChangePasswordRequest：D1 old_password null（错误维度）
      it('ChangePasswordRequest D1 old_password null preserved', 0, () => {
        const r: ChangePasswordRequest = { old_password: null, new_password: 'new' };
        expect(r.old_password).assertNull();
        expect(r.new_password).assertEqual('new');
      });
      // ChangePasswordRequest：边界 old_password 非空
      it('ChangePasswordRequest boundary old_password non-null', 0, () => {
        const r: ChangePasswordRequest = { old_password: 'old', new_password: 'new' };
        expect(r.old_password).assertEqual('old');
      });

      // RiskPredictRequest：正向 + D1 多可空字段 null（错误维度）+ 字面量联合
      it('RiskPredictRequest positive + D1 nullable fields null preserved', 0, () => {
        const r: RiskPredictRequest = {
          diabetes_history: 'healthy', diabetes_type: null, age: 30,
          gender: 'male', height: 170, weight: 70, waist: null, systolic_bp: null,
          family_history: 'no', pregnancy: null,
        };
        expect(r.diabetes_history).assertEqual('healthy');
        expect(r.diabetes_type).assertNull();
        expect(r.age).assertEqual(30);
        expect(r.gender).assertEqual('male');
        expect(r.waist).assertNull();
        expect(r.systolic_bp).assertNull();
        expect(r.family_history).assertEqual('no');
        expect(r.pregnancy).assertNull();
      });
      // RiskPredictRequest：边界 字面量联合穷举（diabetes_history 3 值 / gender 2 值 / family_history 2 值 / diabetes_type 4 值 + null / pregnancy bool）
      it('RiskPredictRequest boundary: literal union exhaustive values', 0, () => {
        const h1: RiskPredictRequest = { diabetes_history: 'healthy', diabetes_type: null, age: 1, gender: 'male', height: 1, weight: 1, waist: null, systolic_bp: null, family_history: 'yes', pregnancy: null };
        const h2: RiskPredictRequest = { diabetes_history: 'prediabetes', diabetes_type: 'type1', age: 1, gender: 'female', height: 1, weight: 1, waist: 80, systolic_bp: 120, family_history: 'no', pregnancy: true };
        const h3: RiskPredictRequest = { diabetes_history: 'diagnosed', diabetes_type: 'type2', age: 1, gender: 'male', height: 1, weight: 1, waist: null, systolic_bp: null, family_history: 'yes', pregnancy: false };
        const t3: RiskPredictRequest = { diabetes_history: 'healthy', diabetes_type: 'gestational', age: 1, gender: 'female', height: 1, weight: 1, waist: null, systolic_bp: null, family_history: 'no', pregnancy: null };
        const t4: RiskPredictRequest = { diabetes_history: 'healthy', diabetes_type: 'other', age: 1, gender: 'male', height: 1, weight: 1, waist: null, systolic_bp: null, family_history: 'no', pregnancy: null };
        expect(h1.diabetes_history).assertEqual('healthy');
        expect(h2.diabetes_history).assertEqual('prediabetes');
        expect(h3.diabetes_history).assertEqual('diagnosed');
        expect(h2.diabetes_type).assertEqual('type1');
        expect(h3.diabetes_type).assertEqual('type2');
        expect(t3.diabetes_type).assertEqual('gestational');
        expect(t4.diabetes_type).assertEqual('other');
        expect(h2.pregnancy).assertTrue();
        expect(h3.pregnancy).assertFalse();
      });

      // RiskPredictResponse：正向 + risk_level 三值
      it('RiskPredictResponse positive + risk_level low', 0, () => {
        const r: RiskPredictResponse = {
          record_id: 1, risk_score: 20.5, risk_level: 'low',
          risk_level_label: '低风险', matched_diabetes_type: '2型',
          advice: '注意饮食', created_at: '2026-07-01',
        };
        expect(r.record_id).assertEqual(1);
        expect(r.risk_score).assertEqual(20.5);
        expect(r.risk_level).assertEqual('low');
        expect(r.risk_level_label).assertEqual('低风险');
        expect(r.matched_diabetes_type).assertEqual('2型');
        expect(r.advice).assertEqual('注意饮食');
      });
      // RiskPredictResponse：边界 risk_level medium/high
      it('RiskPredictResponse boundary risk_level medium/high', 0, () => {
        const m: RiskPredictResponse = { record_id: 2, risk_score: 50, risk_level: 'medium', risk_level_label: '中', matched_diabetes_type: 'x', advice: 'a', created_at: 't' };
        const h: RiskPredictResponse = { record_id: 3, risk_score: 80, risk_level: 'high', risk_level_label: '高', matched_diabetes_type: 'x', advice: 'a', created_at: 't' };
        expect(m.risk_level).assertEqual('medium');
        expect(h.risk_level).assertEqual('high');
      });

      // RiskHistoryItem：正向 + 字面量联合
      it('RiskHistoryItem positive + literal unions', 0, () => {
        const r: RiskHistoryItem = {
          id: 1, risk_score: 30, risk_level: 'low', risk_level_label: '低',
          matched_diabetes_type: '2型', age: 40, gender: 'female', bmi: 24.5,
          family_history: 'yes', created_at: '2026-07-01',
        };
        expect(r.id).assertEqual(1);
        expect(r.risk_level).assertEqual('low');
        expect(r.gender).assertEqual('female');
        expect(r.family_history).assertEqual('yes');
        expect(r.bmi).assertEqual(24.5);
      });

      // CollectedArticle extends Article：extends 链叠加 + D1 cover null + tags 边界
      it('CollectedArticle extends Article: base + derived fields co-reachable (positive + D1 null + empty tags)', 0, () => {
        const c: CollectedArticle = {
          id: 1, title: 't', cover: null, author: 'a', category: 'c', tags: [],
          summary: 's', views: 0, created_at: '2026-01-02', collect_id: 99,
        };
        expect(c.id).assertEqual(1);
        expect(c.title).assertEqual('t');
        expect(c.cover).assertNull();
        expect(c.tags.length).assertEqual(0);
        expect(c.collect_id).assertEqual(99);
      });

      // ArticleGenerateCategoryItem：正向 + D1 recommended/reason null（错误维度）
      it('ArticleGenerateCategoryItem positive + D1 recommended/reason null preserved', 0, () => {
        const i: ArticleGenerateCategoryItem = { label: '标签', recommended: null, reason: null };
        expect(i.label).assertEqual('标签');
        expect(i.recommended).assertNull();
        expect(i.reason).assertNull();
      });
      // ArticleGenerateCategoryItem：边界 recommended bool / reason 非空
      it('ArticleGenerateCategoryItem boundary recommended bool + reason non-null', 0, () => {
        const a: ArticleGenerateCategoryItem = { label: 'a', recommended: true, reason: 'r1' };
        const b: ArticleGenerateCategoryItem = { label: 'b', recommended: false, reason: 'r2' };
        expect(a.recommended).assertTrue();
        expect(b.recommended).assertFalse();
        expect(a.reason).assertEqual('r1');
      });

      // ArticleGenerateCategorySelection：正向 + stage 字面量 + categories D3 嵌套数组
      it('ArticleGenerateCategorySelection positive + stage literal + D3 nested categories array', 0, () => {
        const c0: ArticleGenerateCategoryItem = { label: 'a', recommended: true, reason: 'r' };
        const c1: ArticleGenerateCategoryItem = { label: 'b', recommended: null, reason: null };
        const sel: ArticleGenerateCategorySelection = {
          stage: 'category_selection',
          categories: [c0, c1],
        };
        expect(sel.stage).assertEqual('category_selection');
        expect(sel.categories.length).assertEqual(2);
        expect(sel.categories[0].label).assertEqual('a');
        expect(sel.categories[0].recommended).assertTrue();
        expect(sel.categories[1].recommended).assertNull();
      });
      // ArticleGenerateCategorySelection：边界 categories 空数组（D2 不做联合，stage 字段路由）
      it('ArticleGenerateCategorySelection boundary empty categories array', 0, () => {
        const sel: ArticleGenerateCategorySelection = { stage: 'category_selection', categories: [] };
        expect(sel.categories.length).assertEqual(0);
      });

      // PlanGenerateRequestHealthInfo（D3）：正向 + 字面量联合 gender
      it('PlanGenerateRequestHealthInfo positive + gender boundary (D3 named)', 0, () => {
        const h: PlanGenerateRequestHealthInfo = { age: 30, gender: 'male', height: 170, weight: 70 };
        expect(h.age).assertEqual(30);
        expect(h.gender).assertEqual('male');
        expect(h.height).assertEqual(170);
        expect(h.weight).assertEqual(70);
        const h2: PlanGenerateRequestHealthInfo = { age: 25, gender: 'female', height: 160, weight: 55 };
        expect(h2.gender).assertEqual('female');
      });
      // PlanGenerateRequestPreferences（D3）：正向
      it('PlanGenerateRequestPreferences positive (D3 named)', 0, () => {
        const p: PlanGenerateRequestPreferences = { dietary: '低糖', activity: '步行' };
        expect(p.dietary).assertEqual('低糖');
        expect(p.activity).assertEqual('步行');
      });
      // PlanGenerateRequest：D3 嵌套 health_info + preferences 深层字段可达（错误维度）
      it('PlanGenerateRequest positive + D3 nested deep field access', 0, () => {
        const hi: PlanGenerateRequestHealthInfo = { age: 30, gender: 'male', height: 170, weight: 70 };
        const pf: PlanGenerateRequestPreferences = { dietary: '低糖', activity: '步行' };
        const r: PlanGenerateRequest = {
          health_info: hi,
          preferences: pf,
        };
        expect(r.health_info.age).assertEqual(30);
        expect(r.health_info.gender).assertEqual('male');
        expect(r.health_info.height).assertEqual(170);
        expect(r.health_info.weight).assertEqual(70);
        expect(r.preferences.dietary).assertEqual('低糖');
        expect(r.preferences.activity).assertEqual('步行');
      });

      // PlanAdjustRequest：正向
      it('PlanAdjustRequest positive', 0, () => {
        const r: PlanAdjustRequest = { plan_id: 1, feedback: '太累' };
        expect(r.plan_id).assertEqual(1);
        expect(r.feedback).assertEqual('太累');
      });

      // PlanResponse：正向 + LifePlan[] 数组（引用 models 类型）
      it('PlanResponse positive + LifePlan[] arrays', 0, () => {
        const d: LifePlan = { id: 1, plan_type: 'diet', order_num: 1, time_desc: '早', title: 't', content: 'c' };
        const e: LifePlan = { id: 2, plan_type: 'exercise', order_num: 2, time_desc: '晚', title: 't', content: 'c' };
        const o: LifePlan = { id: 3, plan_type: 'other', order_num: 3, time_desc: '日', title: 't', content: 'c' };
        const r: PlanResponse = {
          plan_id: 1,
          diet_plans: [d],
          exercise_plans: [e],
          other_plans: [o],
        };
        expect(r.plan_id).assertEqual(1);
        expect(r.diet_plans.length).assertEqual(1);
        expect(r.diet_plans[0].plan_type).assertEqual('diet');
        expect(r.exercise_plans[0].plan_type).assertEqual('exercise');
        expect(r.other_plans[0].plan_type).assertEqual('other');
      });
      // PlanResponse：边界 三个 plans 全空数组
      it('PlanResponse boundary all plans empty arrays', 0, () => {
        const r: PlanResponse = { plan_id: 2, diet_plans: [], exercise_plans: [], other_plans: [] };
        expect(r.diet_plans.length).assertEqual(0);
        expect(r.exercise_plans.length).assertEqual(0);
        expect(r.other_plans.length).assertEqual(0);
      });

      // PlanCurrentResponse extends PlanResponse：extends 链叠加
      it('PlanCurrentResponse extends PlanResponse: base + derived fields co-reachable', 0, () => {
        const r: PlanCurrentResponse = {
          plan_id: 1, diet_plans: [], exercise_plans: [], other_plans: [],
          generated_at: '2026-07-01 10:00:00',
        };
        expect(r.plan_id).assertEqual(1);
        expect(r.diet_plans.length).assertEqual(0);
        expect(r.generated_at).assertEqual('2026-07-01 10:00:00');
      });

      // PunchCreateRequest：正向 + D1 remarks null（错误维度）+ 字面量联合
      it('PunchCreateRequest positive + D1 remarks null preserved', 0, () => {
        const r: PunchCreateRequest = {
          plan_id: 1, punch_type: 'diet', completion_status: 'completed', remarks: null,
        };
        expect(r.plan_id).assertEqual(1);
        expect(r.punch_type).assertEqual('diet');
        expect(r.completion_status).assertEqual('completed');
        expect(r.remarks).assertNull();
      });
      // PunchCreateRequest：边界 remarks 非空 + exercise/uncompleted
      it('PunchCreateRequest boundary remarks non-null + exercise/uncompleted', 0, () => {
        const r: PunchCreateRequest = {
          plan_id: 2, punch_type: 'exercise', completion_status: 'uncompleted', remarks: '累',
        };
        expect(r.punch_type).assertEqual('exercise');
        expect(r.completion_status).assertEqual('uncompleted');
        expect(r.remarks).assertEqual('累');
      });

      // PunchCreateResponse：正向 + 字面量联合
      it('PunchCreateResponse positive + literal unions', 0, () => {
        const r: PunchCreateResponse = {
          id: 1, plan_id: 1, punch_type: 'diet', completion_status: 'completed',
          remarks: 'ok', punch_time: '2026-07-01 08:00:00',
        };
        expect(r.id).assertEqual(1);
        expect(r.plan_id).assertEqual(1);
        expect(r.punch_type).assertEqual('diet');
        expect(r.completion_status).assertEqual('completed');
        expect(r.remarks).assertEqual('ok');
        expect(r.punch_time).assertEqual('2026-07-01 08:00:00');
      });

      // PunchListParams extends PaginationParams：extends 链叠加 + D1 三可空字段 null（错误维度）
      it('PunchListParams extends PaginationParams: base + derived + D1 nullable null preserved', 0, () => {
        const p: PunchListParams = {
          page: 1, pageSize: 20, startDate: null, endDate: null, punch_type: null,
        };
        expect(p.page).assertEqual(1);
        expect(p.pageSize).assertEqual(20);
        expect(p.startDate).assertNull();
        expect(p.endDate).assertNull();
        expect(p.punch_type).assertNull();
      });
      // PunchListParams：边界 非空 + punch_type='exercise'
      it('PunchListParams boundary non-null filters + punch_type exercise', 0, () => {
        const p: PunchListParams = {
          page: 2, pageSize: 50, startDate: '2026-07-01', endDate: '2026-07-31', punch_type: 'exercise',
        };
        expect(p.startDate).assertEqual('2026-07-01');
        expect(p.endDate).assertEqual('2026-07-31');
        expect(p.punch_type).assertEqual('exercise');
      });

      // PunchAnalysisTrendDay（D3）：正向
      it('PunchAnalysisTrendDay positive (D3 named)', 0, () => {
        const d: PunchAnalysisTrendDay = { date: '2026-07-01', diet_completed: 3, exercise_completed: 2 };
        expect(d.date).assertEqual('2026-07-01');
        expect(d.diet_completed).assertEqual(3);
        expect(d.exercise_completed).assertEqual(2);
      });
      // PunchAnalysisResponse：正向 + D3 嵌套数组 last_7_days_trend + improvement_suggestions 数组
      it('PunchAnalysisResponse positive + D3 nested trend array + suggestions array', 0, () => {
        const t0: PunchAnalysisTrendDay = { date: '2026-07-01', diet_completed: 3, exercise_completed: 2 };
        const t1: PunchAnalysisTrendDay = { date: '2026-07-02', diet_completed: 1, exercise_completed: 0 };
        const r: PunchAnalysisResponse = {
          diet_completion_rate: 0.8, exercise_completion_rate: 0.6, total_punches: 14,
          last_7_days_trend: [t0, t1],
          adherence_comment: '坚持不错',
          improvement_suggestions: ['增加运动', '减少糖分'],
        };
        expect(r.diet_completion_rate).assertEqual(0.8);
        expect(r.exercise_completion_rate).assertEqual(0.6);
        expect(r.total_punches).assertEqual(14);
        expect(r.last_7_days_trend.length).assertEqual(2);
        expect(r.last_7_days_trend[0].diet_completed).assertEqual(3);
        expect(r.last_7_days_trend[1].exercise_completed).assertEqual(0);
        expect(r.adherence_comment).assertEqual('坚持不错');
        expect(r.improvement_suggestions.length).assertEqual(2);
        expect(r.improvement_suggestions[0]).assertEqual('增加运动');
      });
      // PunchAnalysisResponse：边界 空数组 trend + 空 suggestions
      it('PunchAnalysisResponse boundary empty trend + empty suggestions', 0, () => {
        const r: PunchAnalysisResponse = {
          diet_completion_rate: 0, exercise_completion_rate: 0, total_punches: 0,
          last_7_days_trend: [], adherence_comment: '', improvement_suggestions: [],
        };
        expect(r.last_7_days_trend.length).assertEqual(0);
        expect(r.improvement_suggestions.length).assertEqual(0);
      });
    });
  });
}
