import { RiskPredictResponse, RiskHistoryItem, RiskPredictRequest, ApiError } from '../types/api';
import { API_RISK_PREDICT, API_RISK_HISTORY } from '../common/constants/ApiEndpoints';
import { AuthStore } from './AuthStore';
import { STORAGE_KEYS, PreferencesManager } from '../common/persistence/PreferencesManager';
import { safeJsonParse, safeJsonStringify } from '../utils/Helpers';

interface RiskPredictWrapper {
  data: RiskPredictResponse;
}

interface RiskHistoryWrapper {
  data: RiskHistoryItem[];
}

@ObservedV2
export class RiskFormData {
  @Trace age: number = 0;
  @Trace gender: 'male' | 'female' | null = null;
  @Trace height: number = 0;
  @Trace weight: number = 0;
  @Trace waist: number | null = null;
  @Trace systolic_bp: number | null = null;
  @Trace family_history: 'yes' | 'no' | null = null;
  @Trace pregnancy: boolean | null = null;
  @Trace diabetes_history: 'healthy' | 'prediabetes' | 'diagnosed' | null = null;
  @Trace diabetes_type: 'type1' | 'type2' | 'gestational' | 'other' | null = null;
  @Trace currentStep: number = 0;
  @Trace isSubmitting: boolean = false;
  @Trace submitResult: RiskPredictResponse | null = null;
  @Trace history: RiskHistoryItem[] = [];
  @Trace isLoadingHistory: boolean = false;
  @Trace errorMessage: string | null = null;
}

export interface RiskFormBackup {  diabetes_history: 'healthy' | 'prediabetes' | 'diagnosed' | null;
  diabetes_type: 'type1' | 'type2' | 'gestational' | 'other' | null;
  age: number;
  gender: 'male' | 'female' | null;
  height: number;
  weight: number;
  waist: number | null;
  systolic_bp: number | null;
  family_history: 'yes' | 'no' | null;
  pregnancy: boolean | null;
  currentStep: number;
}

class RiskFormStore {
  private static instance: RiskFormStore | null = null;
  private authStore: AuthStore;
  private prefsManager: PreferencesManager;
  private data: RiskFormData;

  private constructor(authStore: AuthStore, prefsManager: PreferencesManager) {
    this.authStore = authStore;
    this.prefsManager = prefsManager;
    this.data = new RiskFormData();
  }

  static getInstance(authStore?: AuthStore, prefsManager?: PreferencesManager): RiskFormStore {
    if (RiskFormStore.instance !== null) {
      return RiskFormStore.instance;
    }
    if (authStore === undefined || prefsManager === undefined) {
      throw new Error('RiskFormStore: AuthStore and PreferencesManager required for first initialization');
    }
    RiskFormStore.instance = new RiskFormStore(authStore, prefsManager);
    return RiskFormStore.instance;
  }

  getFormData(): RiskFormData {
    return this.data;
  }

  getCurrentStep(): number {
    return this.data.currentStep;
  }

  getSubmitResult(): RiskPredictResponse | null {
    return this.data.submitResult;
  }

  getHistory(): RiskHistoryItem[] {
    return this.data.history;
  }

  getErrorMessage(): string | null {
    return this.data.errorMessage;
  }

  saveStep(step: number, partialData: RiskFormBackup): void {
    if (partialData.age !== undefined) {
      this.data.age = partialData.age;
    }
    if (partialData.gender !== undefined) {
      this.data.gender = partialData.gender;
    }
    if (partialData.height !== undefined) {
      this.data.height = partialData.height;
    }
    if (partialData.weight !== undefined) {
      this.data.weight = partialData.weight;
    }
    if (partialData.waist !== undefined) {
      this.data.waist = partialData.waist;
    }
    if (partialData.systolic_bp !== undefined) {
      this.data.systolic_bp = partialData.systolic_bp;
    }
    if (partialData.family_history !== undefined) {
      this.data.family_history = partialData.family_history;
    }
    if (partialData.pregnancy !== undefined) {
      this.data.pregnancy = partialData.pregnancy;
    }
    if (partialData.diabetes_history !== undefined) {
      this.data.diabetes_history = partialData.diabetes_history;
    }
    if (partialData.diabetes_type !== undefined) {
      this.data.diabetes_type = partialData.diabetes_type;
    }
    this.data.currentStep = step;
    this.persistBackup();
  }

  async submit(): Promise<void> {
    if (this.data.diabetes_history === null || this.data.age <= 0 || this.data.gender === null ||
      this.data.height <= 0 || this.data.weight <= 0 || this.data.family_history === null) {
      this.data.errorMessage = '请完善所有必填字段';
      this.data.isSubmitting = false;
      return;
    }

    this.data.isSubmitting = true;
    try {
      const body: RiskPredictRequest = {
        diabetes_history: this.data.diabetes_history,
        diabetes_type: this.data.diabetes_type,
        age: this.data.age,
        gender: this.data.gender,
        height: this.data.height,
        weight: this.data.weight,
        waist: this.data.waist,
        systolic_bp: this.data.systolic_bp,
        family_history: this.data.family_history,
        pregnancy: this.data.pregnancy
      };
      const wrapper: RiskPredictWrapper =
        await this.authStore.getHttpClient().request<RiskPredictWrapper>('POST', API_RISK_PREDICT, body);
      this.data.submitResult = wrapper.data;
      this.data.errorMessage = null;
      await this.deleteBackup();
    } catch (e) {
      this.data.errorMessage = (e as ApiError).message;
    } finally {
      this.data.isSubmitting = false;
    }
  }

  async loadHistory(page?: number, pageSize?: number): Promise<void> {
    this.data.isLoadingHistory = true;
    const p: number = page ?? 1;
    const ps: number = pageSize ?? 20;
    const url: string = API_RISK_HISTORY + '?page=' + p + '&page_size=' + ps;

    try {
      const wrapper: RiskHistoryWrapper =
        await this.authStore.getHttpClient().request<RiskHistoryWrapper>('GET', url, null);
      this.data.history = wrapper.data ?? [];
      this.data.errorMessage = null;
    } catch (e) {
      this.data.errorMessage = (e as ApiError).message;
    } finally {
      this.data.isLoadingHistory = false;
    }
  }

  async clearFormData(): Promise<void> {
    this.data.age = 0;
    this.data.gender = null;
    this.data.height = 0;
    this.data.weight = 0;
    this.data.waist = null;
    this.data.systolic_bp = null;
    this.data.family_history = null;
    this.data.pregnancy = null;
    this.data.diabetes_history = null;
    this.data.diabetes_type = null;
    this.data.currentStep = 0;
    this.data.isSubmitting = false;
    this.data.submitResult = null;
    this.data.history = [];
    this.data.isLoadingHistory = false;
    this.data.errorMessage = null;

    await this.deleteBackup();
  }

  async restoreFromBackup(): Promise<void> {
    const json: string = await this.prefsManager.getString(STORAGE_KEYS.NAME_RISK_FORM,
      STORAGE_KEYS.RISK_FORM_DATA, '');
    if (json === '') {
      return;
    }
    const backup: RiskFormBackup = safeJsonParse<RiskFormBackup>(json, {} as RiskFormBackup);
    if (backup === null || typeof backup !== 'object') {
      return;
    }

    this.data.diabetes_history = (backup.diabetes_history ?? null);
    this.data.diabetes_type = (backup.diabetes_type ?? null);
    this.data.age = backup.age ?? 0;
    this.data.gender = backup.gender ?? null;
    this.data.height = backup.height ?? 0;
    this.data.weight = backup.weight ?? 0;
    this.data.waist = backup.waist ?? null;
    this.data.systolic_bp = backup.systolic_bp ?? null;
    this.data.family_history = backup.family_history ?? null;
    this.data.pregnancy = backup.pregnancy ?? null;
    this.data.currentStep = backup.currentStep ?? 1;
  }

  private persistBackup(): Promise<void> {
    const backup: RiskFormBackup = {
      diabetes_history: this.data.diabetes_history,
      diabetes_type: this.data.diabetes_type,
      age: this.data.age,
      gender: this.data.gender,
      height: this.data.height,
      weight: this.data.weight,
      waist: this.data.waist,
      systolic_bp: this.data.systolic_bp,
      family_history: this.data.family_history,
      pregnancy: this.data.pregnancy,
      currentStep: this.data.currentStep
    };
    const json: string = safeJsonStringify(backup);
    return this.prefsManager.putString(STORAGE_KEYS.NAME_RISK_FORM, STORAGE_KEYS.RISK_FORM_DATA, json);
  }

  private deleteBackup(): Promise<void> {
    return this.prefsManager.delete(STORAGE_KEYS.NAME_RISK_FORM, STORAGE_KEYS.RISK_FORM_DATA);
  }
}

export { RiskFormStore };
