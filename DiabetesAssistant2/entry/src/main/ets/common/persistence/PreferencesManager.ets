import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x0000;
const TAG: string = 'PreferencesManager';

export interface StorageKeysInterface {
  readonly AUTH_TOKEN: string;
  readonly AUTH_ROLE: string;
  readonly AUTH_USER: string;
  readonly AUTH_MUST_CHANGE_PASSWORD: string;
  readonly DISCLAIMER_ACCEPTED: string;
  readonly CHAT_CONVERSATION_ID: string;
  readonly RISK_FORM_DATA: string;
  readonly NAME_AUTH: string;
  readonly NAME_CHAT: string;
  readonly NAME_RISK_FORM: string;
}

export const STORAGE_KEYS: StorageKeysInterface = {
  AUTH_TOKEN: 'auth_token',
  AUTH_ROLE: 'auth_role',
  AUTH_USER: 'auth_user',
  AUTH_MUST_CHANGE_PASSWORD: 'auth_must_change_password',
  DISCLAIMER_ACCEPTED: 'disclaimer_accepted',
  CHAT_CONVERSATION_ID: 'chat_conversation_id',
  RISK_FORM_DATA: 'risk_form_data',
  NAME_AUTH: 'auth',
  NAME_CHAT: 'chat',
  NAME_RISK_FORM: 'risk_form',
};

export class PreferencesManager {
  private static instance: PreferencesManager | null = null;
  private context: common.Context | null = null;
  private storeCache: Map<string, preferences.Preferences> = new Map();

  private constructor() {}

  static getInstance(context?: common.Context): PreferencesManager | null {
    if (PreferencesManager.instance !== null) {
      return PreferencesManager.instance;
    }
    if (context === undefined) {
      return null;
    }
    const instance = new PreferencesManager();
    instance.context = context;
    PreferencesManager.instance = instance;
    return instance;
  }

  putString(name: string, key: string, value: string): Promise<void> {
    try {
      return this.getOrCreatePreferences(name).then((prefs: preferences.Preferences) => {
        return prefs.put(key, value).then(() => {
          return prefs.flush();
        });
      }).catch((err: Error) => {
        hilog.warn(DOMAIN, TAG, `putString failed for key=${key}: ${err.message}`);
      });
    } catch (err) {
      hilog.warn(DOMAIN, TAG, `putString failed for key=${key}: ${(err as Error).message}`);
      return Promise.resolve();
    }
  }

  getString(name: string, key: string, def: string): Promise<string> {
    try {
      return this.getOrCreatePreferences(name).then((prefs: preferences.Preferences) => {
        return prefs.get(key, def);
      }).then((result: preferences.ValueType) => {
        return result as string;
      }).catch(() => {
        return def;
      });
    } catch (_err) {
      return Promise.resolve(def);
    }
  }

  putBoolean(name: string, key: string, value: boolean): Promise<void> {
    try {
      return this.getOrCreatePreferences(name).then((prefs: preferences.Preferences) => {
        return prefs.put(key, value).then(() => {
          return prefs.flush();
        });
      }).catch((err: Error) => {
        hilog.warn(DOMAIN, TAG, `putBoolean failed for key=${key}: ${err.message}`);
      });
    } catch (err) {
      hilog.warn(DOMAIN, TAG, `putBoolean failed for key=${key}: ${(err as Error).message}`);
      return Promise.resolve();
    }
  }

  getBoolean(name: string, key: string, def: boolean): Promise<boolean> {
    try {
      return this.getOrCreatePreferences(name).then((prefs: preferences.Preferences) => {
        return prefs.get(key, def);
      }).then((result: preferences.ValueType) => {
        return result as boolean;
      }).catch(() => {
        return def;
      });
    } catch (_err) {
      return Promise.resolve(def);
    }
  }

  putNumber(name: string, key: string, value: number): Promise<void> {
    try {
      return this.getOrCreatePreferences(name).then((prefs: preferences.Preferences) => {
        return prefs.put(key, value).then(() => {
          return prefs.flush();
        });
      }).catch((err: Error) => {
        hilog.warn(DOMAIN, TAG, `putNumber failed for key=${key}: ${err.message}`);
      });
    } catch (err) {
      hilog.warn(DOMAIN, TAG, `putNumber failed for key=${key}: ${(err as Error).message}`);
      return Promise.resolve();
    }
  }

  getNumber(name: string, key: string, def: number): Promise<number> {
    try {
      return this.getOrCreatePreferences(name).then((prefs: preferences.Preferences) => {
        return prefs.get(key, def);
      }).then((result: preferences.ValueType) => {
        return result as number;
      }).catch(() => {
        return def;
      });
    } catch (_err) {
      return Promise.resolve(def);
    }
  }

  delete(name: string, key: string): Promise<void> {
    try {
      return this.getOrCreatePreferences(name).then((prefs: preferences.Preferences) => {
        return prefs.delete(key).then(() => {
          return prefs.flush();
        });
      }).catch((err: Error) => {
        hilog.warn(DOMAIN, TAG, `delete failed for key=${key}: ${err.message}`);
      });
    } catch (err) {
      hilog.warn(DOMAIN, TAG, `delete failed for key=${key}: ${(err as Error).message}`);
      return Promise.resolve();
    }
  }

  has(name: string, key: string): Promise<boolean> {
    try {
      return this.getOrCreatePreferences(name).then((prefs: preferences.Preferences) => {
        return prefs.has(key);
      }).catch(() => {
        return false;
      });
    } catch (_err) {
      return Promise.resolve(false);
    }
  }

  flush(name: string): Promise<void> {
    try {
      return this.getOrCreatePreferences(name).then((prefs: preferences.Preferences) => {
        return prefs.flush();
      }).catch((err: Error) => {
        hilog.warn(DOMAIN, TAG, `flush failed for name=${name}: ${err.message}`);
      });
    } catch (err) {
      hilog.warn(DOMAIN, TAG, `flush failed for name=${name}: ${(err as Error).message}`);
      return Promise.resolve();
    }
  }

  private getOrCreatePreferences(name: string): Promise<preferences.Preferences> {
    const cached = this.storeCache.get(name);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    return preferences.getPreferences(this.context!, name).then((prefs: preferences.Preferences) => {
      this.storeCache.set(name, prefs);
      return prefs;
    });
  }
}
