import { PunchRecord, PunchType, CompletionStatus } from '../types/models';
import { ApiError } from '../types/api';
import { AuthStore } from './AuthStore';
import { API_PUNCH, API_PUNCH_LIST } from '../common/constants/ApiEndpoints';

interface BackendWrapper<T> {
  data: T;
}

interface RawPunchRecord {
  id: number;
  plan_id?: number | null;
  plan_item_id?: number | null;
  plan_title?: string | null;
  punch_type: PunchType;
  completion_status: CompletionStatus;
  remarks?: string | null;
  punch_time: string;
}

interface PunchCreateBody {
  plan_id: number;
  punch_type: PunchType;
  completion_status: CompletionStatus;
  remarks: string;
}

function normalizePunchRecord(raw: RawPunchRecord): PunchRecord {
  const planId: number | null = (raw.plan_id !== undefined && raw.plan_id !== null)
    ? raw.plan_id
    : (raw.plan_item_id ?? null);
  return {
    id: raw.id,
    plan_id: planId,
    plan_title: raw.plan_title ?? null,
    punch_type: raw.punch_type,
    completion_status: raw.completion_status,
    remarks: raw.remarks ?? '',
    punch_time: raw.punch_time
  };
}

@ObservedV2
export class PunchData {
  @Trace punchRecords: PunchRecord[] = [];
  @Trace isLoading: boolean = false;
  @Trace errorMessage: string | null = null;
}

export class PunchStore {
  private static instance: PunchStore | null = null;
  private punchData: PunchData;

  private constructor() {
    this.punchData = new PunchData();
  }

  static getInstance(): PunchStore {
    if (PunchStore.instance !== null) {
      return PunchStore.instance;
    }
    PunchStore.instance = new PunchStore();
    return PunchStore.instance;
  }

  getPunchData(): PunchData {
    return this.punchData;
  }

  getError(): string | null {
    return this.punchData.errorMessage;
  }

  async loadPunchList(): Promise<void> {
    this.punchData.isLoading = true;
    this.punchData.errorMessage = null;
    try {
      const url: string = API_PUNCH_LIST + '?page=1&pageSize=100';
      const list: RawPunchRecord[] = await AuthStore.getInstance().getHttpClient()
        .request<BackendWrapper<RawPunchRecord[]>>('GET', url)
        .then((r: BackendWrapper<RawPunchRecord[]>) => r.data);
      const normalized: PunchRecord[] = (list ?? []).map((raw: RawPunchRecord) => normalizePunchRecord(raw));
      this.punchData.punchRecords = normalized;
    } catch (e) {
      this.punchData.errorMessage = (e as ApiError).message ?? '打卡记录加载失败';
    } finally {
      this.punchData.isLoading = false;
    }
  }

  async createPunch(planId: number, punchType: PunchType, completionStatus: CompletionStatus, remarks: string | null): Promise<void> {
    const body: PunchCreateBody = {
      plan_id: planId,
      punch_type: punchType,
      completion_status: completionStatus,
      remarks: remarks ?? ''
    };
    try {
      const raw: RawPunchRecord = await AuthStore.getInstance().getHttpClient()
        .request<BackendWrapper<RawPunchRecord>>('POST', API_PUNCH, body)
        .then((r: BackendWrapper<RawPunchRecord>) => r.data);
      const record: PunchRecord = normalizePunchRecord(raw);
      this.punchData.punchRecords = [record, ...this.punchData.punchRecords];
    } catch (e) {
      this.punchData.errorMessage = (e as ApiError).message ?? '打卡失败，请重试';
    }
  }

  isTodayPunched(planId: number, punchType: PunchType): boolean {
    const today = new Date().toISOString().slice(0, 10);
    return this.punchData.punchRecords.some(
      (r: PunchRecord) => r.plan_id === planId && r.punch_type === punchType && r.punch_time.slice(0, 10) === today
    );
  }
}
