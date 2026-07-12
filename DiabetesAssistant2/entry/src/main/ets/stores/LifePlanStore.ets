import { LifePlan, PlanType } from '../types/models';
import { ApiError, PlanGenerateRequest, PlanGenerateRequestHealthInfo, PlanGenerateRequestPreferences, PlanAdjustRequest } from '../types/api';
import { AuthStore } from './AuthStore';
import { API_PLAN_CURRENT, API_PLAN_GENERATE, API_PLAN_ADJUST } from '../common/constants/ApiEndpoints';

interface BackendWrapper<T> {
  data: T;
}

interface PlanCurrentData {
  plan_id: number;
  diet_plans: LifePlan[];
  exercise_plans: LifePlan[];
  other_plans: LifePlan[];
  generated_at: string;
}

interface PlanMutationData {
  plan_id: number;
  diet_plans: LifePlan[];
  exercise_plans: LifePlan[];
  other_plans: LifePlan[];
}

@ObservedV2
export class LifePlanData {
  @Trace plan_id: number = 0;
  @Trace diet_plans: LifePlan[] = [];
  @Trace exercise_plans: LifePlan[] = [];
  @Trace other_plans: LifePlan[] = [];
  @Trace isLoading: boolean = false;
  @Trace loaded: boolean = false;
  @Trace isGenerating: boolean = false;
  @Trace errorMessage: string | null = null;
}

export class LifePlanStore {
  private static instance: LifePlanStore | null = null;
  private lifePlanData: LifePlanData;

  private constructor() {
    this.lifePlanData = new LifePlanData();
  }

  static getInstance(): LifePlanStore {
    if (LifePlanStore.instance !== null) {
      return LifePlanStore.instance;
    }
    LifePlanStore.instance = new LifePlanStore();
    return LifePlanStore.instance;
  }

  getLifePlanData(): LifePlanData {
    return this.lifePlanData;
  }

  hasPlan(): boolean {
    return this.lifePlanData.diet_plans.length > 0
        || this.lifePlanData.exercise_plans.length > 0
        || this.lifePlanData.other_plans.length > 0;
  }

  isLoading(): boolean {
    return this.lifePlanData.isLoading;
  }

  getError(): string | null {
    return this.lifePlanData.errorMessage;
  }

  async loadCurrentPlan(): Promise<void> {
    this.lifePlanData.isLoading = true;
    this.lifePlanData.errorMessage = null;
    try {
      const data: PlanCurrentData | null = await AuthStore.getInstance().getHttpClient()
        .request<BackendWrapper<PlanCurrentData | null>>('GET', API_PLAN_CURRENT)
        .then((r: BackendWrapper<PlanCurrentData | null>) => r.data);

      if (data === null || data === undefined) {
        this.lifePlanData.plan_id = 0;
        this.lifePlanData.diet_plans = [];
        this.lifePlanData.exercise_plans = [];
        this.lifePlanData.other_plans = [];
      } else {
        this.lifePlanData.plan_id = data.plan_id;
        this.lifePlanData.diet_plans = data.diet_plans ?? [];
        this.lifePlanData.exercise_plans = data.exercise_plans ?? [];
        this.lifePlanData.other_plans = data.other_plans ?? [];
      }
      this.lifePlanData.loaded = true;
    } catch (e) {
      this.lifePlanData.errorMessage = (e as ApiError).message ?? '方案加载失败，请重试';
    } finally {
      this.lifePlanData.isLoading = false;
    }
  }

  private applyPlan(data: PlanMutationData): void {
    this.lifePlanData.plan_id = data.plan_id;
    this.lifePlanData.diet_plans = data.diet_plans ?? [];
    this.lifePlanData.exercise_plans = data.exercise_plans ?? [];
    this.lifePlanData.other_plans = data.other_plans ?? [];
    this.lifePlanData.loaded = true;
  }

  async generatePlan(age: number, gender: 'male' | 'female', height: number, weight: number,
    dietary: string, activity: string): Promise<boolean> {
    this.lifePlanData.isGenerating = true;
    this.lifePlanData.errorMessage = null;
    try {
      const healthInfo: PlanGenerateRequestHealthInfo = { age: age, gender: gender, height: height, weight: weight };
      const preferences: PlanGenerateRequestPreferences = { dietary: dietary, activity: activity };
      const body: PlanGenerateRequest = { health_info: healthInfo, preferences: preferences };
      const data: PlanMutationData = await AuthStore.getInstance().getHttpClient()
        .request<BackendWrapper<PlanMutationData>>('POST', API_PLAN_GENERATE, body)
        .then((r: BackendWrapper<PlanMutationData>) => r.data);
      this.applyPlan(data);
      return true;
    } catch (e) {
      this.lifePlanData.errorMessage = (e as ApiError).message ?? '方案生成失败，请重试';
      return false;
    } finally {
      this.lifePlanData.isGenerating = false;
    }
  }

  async adjustPlan(feedback: string): Promise<boolean> {
    if (this.lifePlanData.plan_id <= 0) {
      this.lifePlanData.errorMessage = '请先生成方案';
      return false;
    }
    this.lifePlanData.isGenerating = true;
    this.lifePlanData.errorMessage = null;
    try {
      const body: PlanAdjustRequest = { plan_id: this.lifePlanData.plan_id, feedback: feedback };
      const data: PlanMutationData = await AuthStore.getInstance().getHttpClient()
        .request<BackendWrapper<PlanMutationData>>('PUT', API_PLAN_ADJUST, body)
        .then((r: BackendWrapper<PlanMutationData>) => r.data);
      this.applyPlan(data);
      return true;
    } catch (e) {
      this.lifePlanData.errorMessage = (e as ApiError).message ?? '方案调整失败，请重试';
      return false;
    } finally {
      this.lifePlanData.isGenerating = false;
    }
  }
}
