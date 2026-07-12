import { User } from '../types/models';
import { LoginRequest, LoginResponse, RegisterRequest, ChangePasswordRequest } from '../types/api';
import { API_AUTH_LOGIN, API_AUTH_REGISTER, API_USER_PASSWORD } from '../common/constants/ApiEndpoints';
import { STORAGE_KEYS, PreferencesManager } from '../common/persistence/PreferencesManager';
import { HttpClient } from '../network/HttpClient';
import { safeJsonParse, safeJsonStringify } from '../utils/Helpers';

const AUTH_TOKEN_KEY: string = 'AUTH_TOKEN';
const AUTH_ROLE_KEY: string = 'AUTH_ROLE';
const AUTH_USER_KEY: string = 'AUTH_USER';
const AUTH_MUST_CHANGE_PASSWORD_KEY: string = 'AUTH_MUST_CHANGE_PASSWORD';

let sToken: string | null = null;
let sRole: 'user' | 'admin' | null = null;
let sUser: User | null = null;
let sMustChangePassword: boolean = false;

interface BackendAuthResponse {
  success: boolean;
  message: string;
  data: LoginResponse;
}

class AuthStore {
  private static instance: AuthStore | null = null;
  private prefsManager: PreferencesManager;
  private httpClient: HttpClient;

  private constructor(prefsManager: PreferencesManager) {
    this.prefsManager = prefsManager;
    this.initAppStorage();
    this.httpClient = new HttpClient({
      tokenProvider: () => this.getToken(),
      onUnauthorized: () => this.handleUnauthorized()
    });
  }

  static getInstance(prefsManager?: PreferencesManager): AuthStore {
    if (AuthStore.instance !== null) {
      return AuthStore.instance;
    }
    if (prefsManager === undefined) {
      throw new Error('AuthStore: PreferencesManager required for first initialization');
    }
    AuthStore.instance = new AuthStore(prefsManager);
    return AuthStore.instance;
  }

  get token(): string | null {
    return sToken;
  }

  get role(): 'user' | 'admin' | null {
    return sRole;
  }

  get user(): User | null {
    return sUser;
  }

  get mustChangePassword(): boolean {
    return sMustChangePassword;
  }

  getHttpClient(): HttpClient {
    return this.httpClient;
  }

  async login(username: string, password: string): Promise<void> {
    const body: LoginRequest = { username, password };
    const wrapper: BackendAuthResponse = await this.httpClient.request<BackendAuthResponse>('POST', API_AUTH_LOGIN, body);
    await this.setSession(wrapper.data);
  }

  private async setSession(response: LoginResponse): Promise<void> {
    sToken = response.token;
    sRole = response.role;
    sUser = response.user;
    sMustChangePassword = response.must_change_password ?? false;
    AppStorage.setOrCreate(AUTH_TOKEN_KEY, response.token);
    AppStorage.setOrCreate(AUTH_ROLE_KEY, response.role);
    AppStorage.setOrCreate(AUTH_USER_KEY, response.user);
    AppStorage.setOrCreate(AUTH_MUST_CHANGE_PASSWORD_KEY, response.must_change_password ?? false);
    await this.prefsManager.putString(STORAGE_KEYS.NAME_AUTH, STORAGE_KEYS.AUTH_TOKEN, response.token);
    await this.prefsManager.putString(STORAGE_KEYS.NAME_AUTH, STORAGE_KEYS.AUTH_ROLE, response.role);
    await this.prefsManager.putString(STORAGE_KEYS.NAME_AUTH, STORAGE_KEYS.AUTH_USER, safeJsonStringify(response.user));
    await this.prefsManager.putBoolean(STORAGE_KEYS.NAME_AUTH, STORAGE_KEYS.AUTH_MUST_CHANGE_PASSWORD, response.must_change_password ?? false);
  }

  async register(username: string, password: string): Promise<void> {
    const body: RegisterRequest = { username, password };
    const wrapper: BackendAuthResponse = await this.httpClient.request<BackendAuthResponse>(

      'POST',
      API_AUTH_REGISTER,
      body
    );
    await this.setSession(wrapper.data);
  }

  async changePassword(newPassword: string, oldPassword?: string): Promise<void> {
    const body: ChangePasswordRequest = {
      old_password: oldPassword ?? null,
      new_password: newPassword
    };
    await this.httpClient.request<ESObject>('POST', API_USER_PASSWORD, body);
    AppStorage.setOrCreate(AUTH_MUST_CHANGE_PASSWORD_KEY, false);
    await this.prefsManager.putBoolean(STORAGE_KEYS.NAME_AUTH, STORAGE_KEYS.AUTH_MUST_CHANGE_PASSWORD, false);
    await this.prefsManager.flush(STORAGE_KEYS.NAME_AUTH);
  }

  async clearAuth(): Promise<void> {
    sToken = null;
    sRole = null;
    sUser = null;
    sMustChangePassword = false;
    AppStorage.setOrCreate(AUTH_TOKEN_KEY, null);
    AppStorage.setOrCreate(AUTH_ROLE_KEY, null);
    AppStorage.setOrCreate(AUTH_USER_KEY, null);
    AppStorage.setOrCreate(AUTH_MUST_CHANGE_PASSWORD_KEY, false);
    await this.prefsManager.delete(STORAGE_KEYS.NAME_AUTH, STORAGE_KEYS.AUTH_TOKEN);
    await this.prefsManager.delete(STORAGE_KEYS.NAME_AUTH, STORAGE_KEYS.AUTH_ROLE);
    await this.prefsManager.delete(STORAGE_KEYS.NAME_AUTH, STORAGE_KEYS.AUTH_USER);
    await this.prefsManager.delete(STORAGE_KEYS.NAME_AUTH, STORAGE_KEYS.AUTH_MUST_CHANGE_PASSWORD);
    await this.prefsManager.flush(STORAGE_KEYS.NAME_AUTH);
  }

  async syncFromPersist(): Promise<void> {
    const token: string = await this.prefsManager.getString(STORAGE_KEYS.NAME_AUTH, STORAGE_KEYS.AUTH_TOKEN, '');
    sToken = token === '' ? null : token;
    AppStorage.setOrCreate(AUTH_TOKEN_KEY, token === '' ? null : token);

    const role: string = await this.prefsManager.getString(STORAGE_KEYS.NAME_AUTH, STORAGE_KEYS.AUTH_ROLE, '');
    if (role === 'user' || role === 'admin') {
      sRole = role;
    } else {
      sRole = null;
    }
    AppStorage.setOrCreate(AUTH_ROLE_KEY, role === '' ? null : role);

    const userStr: string = await this.prefsManager.getString(STORAGE_KEYS.NAME_AUTH, STORAGE_KEYS.AUTH_USER, '');
    console.info('[AuthStore] syncFromPersist userStr=' + userStr);
    if (userStr === '') {
      sUser = null;
      AppStorage.setOrCreate(AUTH_USER_KEY, null);
    } else {
      const user: User | null = safeJsonParse<User>(userStr, {} as User);
      console.info('[AuthStore] syncFromPersist parsed user=' + JSON.stringify(user));
      sUser = user;
      AppStorage.setOrCreate(AUTH_USER_KEY, user);
    }
    console.info('[AuthStore] syncFromPersist AppStorage AUTH_USER=' + JSON.stringify(AppStorage.get<User>(AUTH_USER_KEY)));

    const mustChange: boolean = await this.prefsManager.getBoolean(STORAGE_KEYS.NAME_AUTH, STORAGE_KEYS.AUTH_MUST_CHANGE_PASSWORD, false);
    sMustChangePassword = mustChange;
    AppStorage.setOrCreate(AUTH_MUST_CHANGE_PASSWORD_KEY, mustChange);
  }

  isAdmin(): boolean {
    return this.role === 'admin';
  }

  private initAppStorage(): void {
    AppStorage.setOrCreate<string | null>(AUTH_TOKEN_KEY, null);
    AppStorage.setOrCreate<string | null>(AUTH_ROLE_KEY, null);
    AppStorage.setOrCreate<User | null>(AUTH_USER_KEY, null);
    AppStorage.setOrCreate<boolean>(AUTH_MUST_CHANGE_PASSWORD_KEY, false);
  }

  private getToken(): string | null {
    return this.token;
  }

  private handleUnauthorized(): void {
    this.clearAuth();
  }
}

export { AuthStore };
