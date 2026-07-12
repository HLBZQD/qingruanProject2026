import { ChatKind } from '../types/sse';

export interface ToastItem {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  createdAt: number;
}

@ObservedV2
export class UiData {
  @Trace fabVisible: boolean = false;
  @Trace activeChatKind: ChatKind | null = null;
  @Trace isLoadingGlobal: boolean = false;
  @Trace toastQueue: ToastItem[] = [];
  @Trace disclaimerAccepted: boolean = false;
  @Trace forceChangePasswordVisible: boolean = false;
  @Trace setFabVisibleCallback: ((visible: boolean) => void) | null = null;
  @Trace errorMessage: string | null = null;
}

class UiStore {
  private static instance: UiStore | null = null;
  private uiData: UiData;
  private toastTimers: Map<string, number> = new Map();

  private constructor() {
    this.uiData = new UiData();
  }

  static getInstance(): UiStore {
    if (UiStore.instance !== null) {
      return UiStore.instance;
    }
    UiStore.instance = new UiStore();
    return UiStore.instance;
  }

  getUiData(): UiData {
    return this.uiData;
  }

  setFabVisible(visible: boolean): void {
    this.uiData.fabVisible = visible;
    if (this.uiData.setFabVisibleCallback !== null) {
      this.uiData.setFabVisibleCallback(visible);
    }
  }

  // TODO: 死代码，待后续轮次统一清理。AiChatDialog 浮层已替换为独立页面路由
  showChatDialog(kind: ChatKind): void {
    if (this.uiData.activeChatKind === kind) {
      return;
    }
    if (this.uiData.activeChatKind !== null && this.uiData.activeChatKind !== kind) {
      this.closeChatDialog();
    }
    this.uiData.activeChatKind = kind;
    this.uiData.fabVisible = false;
  }

  // TODO: 死代码，待后续轮次统一清理
  closeChatDialog(): void {
    this.uiData.activeChatKind = null;
  }

  showGlobalLoading(): void {
    this.uiData.isLoadingGlobal = true;
  }

  hideGlobalLoading(): void {
    this.uiData.isLoadingGlobal = false;
  }

  showToast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
    const item: ToastItem = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 9),
      message: message,
      type: type,
      createdAt: Date.now()
    };
    if (this.uiData.toastQueue.length >= 5) {
      const removed: ToastItem = this.uiData.toastQueue[0];
      const removedTimerId: number | undefined = this.toastTimers.get(removed.id);
      if (removedTimerId !== undefined) {
        clearTimeout(removedTimerId);
      }
      this.toastTimers.delete(removed.id);
      this.uiData.toastQueue = this.uiData.toastQueue.slice(1);
    }
    this.uiData.toastQueue = [...this.uiData.toastQueue, item];
    const timerId: number = setTimeout(() => {
      this.dismissToast(item.id);
    }, 3000);
    this.toastTimers.set(item.id, timerId);
  }

  dismissToast(id: string): void {
    this.uiData.toastQueue = this.uiData.toastQueue.filter((t: ToastItem) => t.id !== id);
    const timerId: number | undefined = this.toastTimers.get(id);
    if (timerId !== undefined) {
      clearTimeout(timerId);
      this.toastTimers.delete(id);
    }
  }

  acceptDisclaimer(): void {
    this.uiData.disclaimerAccepted = true;
  }

  resetDisclaimer(): void {
    this.uiData.disclaimerAccepted = false;
  }

  showChangePasswordDialog(): void {
    this.uiData.forceChangePasswordVisible = true;
  }

  hideChangePasswordDialog(): void {
    this.uiData.forceChangePasswordVisible = false;
  }

  setErrorMessage(msg: string | null): void {
    this.uiData.errorMessage = msg;
  }

  resetState(): void {
    this.uiData.fabVisible = false;
    this.uiData.activeChatKind = null;
    this.uiData.isLoadingGlobal = false;
    this.uiData.toastQueue = [];
    this.uiData.disclaimerAccepted = false;
    this.uiData.forceChangePasswordVisible = false;
    this.uiData.errorMessage = null;
    this.uiData.setFabVisibleCallback = null;
    this.toastTimers.forEach((timerId: number) => clearTimeout(timerId));
    this.toastTimers.clear();
  }

  registerFabCallback(cb: (visible: boolean) => void): void {
    this.uiData.setFabVisibleCallback = cb;
  }
}

export { UiStore };
