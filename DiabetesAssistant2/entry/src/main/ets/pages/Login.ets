import { router } from '@kit.ArkUI';
import { AuthStore } from '../stores/AuthStore';
import { Icon } from '../components/Icon';
import { LOGIN, CHANGE_PASSWORD, ROOT_SHELL } from '../common/constants/RouteNames';
import {
  COLOR_PAPER_50, COLOR_PAPER_100,
  COLOR_INK_700, COLOR_INK_400, COLOR_INK_300,
  COLOR_DANGER_600, COLOR_ACCENT_SAGE_500,
  TYPO_DISPLAY_M, TYPO_TITLE, TYPO_BODY, TYPO_LABEL,
  SPACE_1, SPACE_2, SPACE_3, SPACE_4, SPACE_6, SPACE_7, SPACE_9,
  RADIUS_CELL, RADIUS_PILL
} from '../common/constants/DesignTokens';

@Entry
@Component
struct LoginPage {
  @State username: string = '';
  @State password: string = '';
  @State confirmPassword: string = '';
  @State isRegisterMode: boolean = false;
  @State isLoading: boolean = false;
  @State errorMessage: string | null = null;
  private redirectTarget: string | null = null;
  private redirectParams: Object | null = null;

  aboutToAppear(): void {
    const params = router.getParams() as Record<string, Object> | undefined;
    if (params !== undefined) {
      this.redirectTarget = (params['redirect'] as string) ?? null;
      this.redirectParams = (params['redirectParams'] as Object) ?? null;
    }

    if (AuthStore.getInstance().token !== null) {
      this.navigateAfterLogin();
    }
  }

  async handleLogin(): Promise<void> {
    if (!this.username.trim() || !this.password) {
      this.errorMessage = '请输入用户名和密码';
      return;
    }
    this.isLoading = true;
    this.errorMessage = null;
    try {
      await AuthStore.getInstance().login(this.username.trim(), this.password);
      this.navigateAfterLogin();
    } catch (e) {
      this.errorMessage = (e as Error).message ?? '登录失败，请重试';
    } finally {
      this.isLoading = false;
    }
  }

  async handleRegister(): Promise<void> {
    if (!this.username.trim()) {
      this.errorMessage = '请输入用户名';
      return;
    }
    if (!this.password) {
      this.errorMessage = '请输入密码';
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.errorMessage = '两次输入的密码不一致';
      return;
    }
    this.isLoading = true;
    this.errorMessage = null;
    try {
      await AuthStore.getInstance().register(this.username.trim(), this.password);
      this.navigateAfterLogin();
    } catch (e) {
      this.errorMessage = (e as Error).message ?? '注册失败，请重试';
    } finally {
      this.isLoading = false;
    }
  }

  navigateAfterLogin(): void {
    if (AuthStore.getInstance().mustChangePassword) {
      const params: Record<string, Object> = {};
      if (this.redirectTarget !== null) {
        params['redirect'] = this.redirectTarget;
      }
      if (this.redirectParams !== null) {
        const rp = this.redirectParams as Record<string, Object>;
        const keys = Object.keys(rp);
        for (let i = 0; i < keys.length; i++) {
          params[keys[i]] = rp[keys[i]];
        }
      }
      router.replaceUrl({ url: 'pages/ChangePassword', params: params as Record<string, Object> });
      return;
    }

    if (this.redirectTarget !== null) {
      router.replaceUrl({ url: 'pages/' + this.redirectTarget, params: this.redirectParams as Record<string, Object> });
    } else {
      router.replaceUrl({ url: 'pages/Index' });
    }
  }

  toggleMode(): void {
    this.isRegisterMode = !this.isRegisterMode;
    this.errorMessage = null;
  }

  handleSkip(): void {
    const len: number = Number(router.getLength());
    if (len > 1) {
      router.back();
    } else {
      router.replaceUrl({ url: 'pages/Index' });
    }
  }

  build() {
    Scroll() {
      Column() {
        Row() {
          Blank()
          Text('暂不登录')
            .fontSize(TYPO_LABEL.size)
            .fontColor(COLOR_ACCENT_SAGE_500)
            .onClick(() => { this.handleSkip(); })
        }
        .width('100%')
        .padding({ left: SPACE_4, right: SPACE_4, top: SPACE_3 })

        Column({ space: SPACE_3 }) {
          Text('糖尿病预治助手')
            .fontSize(TYPO_DISPLAY_M.size)
            .fontWeight(TYPO_DISPLAY_M.weight)
            .fontColor(COLOR_INK_700)
            .textAlign(TextAlign.Center)
          Text('科学管理，健康相伴')
            .fontSize(TYPO_TITLE.size)
            .fontWeight(TYPO_TITLE.weight)
            .fontColor(COLOR_INK_400)
            .textAlign(TextAlign.Center)
        }
        .width('100%')
        .margin({ top: SPACE_7 })

        Column({ space: SPACE_4 }) {
          TextInput({ placeholder: '用户名', text: $$this.username })
            .type(InputType.Normal)
            .fontSize(TYPO_BODY.size)
            .fontColor(COLOR_INK_700)
            .placeholderColor(COLOR_INK_300)
            .backgroundColor(COLOR_PAPER_100)
            .borderRadius(RADIUS_CELL)
            .height(SPACE_9)
            .padding({ left: SPACE_3, right: SPACE_3 })

          TextInput({ placeholder: '密码', text: $$this.password })
            .type(InputType.Password)
            .fontSize(TYPO_BODY.size)
            .fontColor(COLOR_INK_700)
            .placeholderColor(COLOR_INK_300)
            .backgroundColor(COLOR_PAPER_100)
            .borderRadius(RADIUS_CELL)
            .height(SPACE_9)
            .padding({ left: SPACE_3, right: SPACE_3 })

          if (this.isRegisterMode) {
            TextInput({ placeholder: '确认密码', text: $$this.confirmPassword })
              .type(InputType.Password)
              .fontSize(TYPO_BODY.size)
              .fontColor(COLOR_INK_700)
              .placeholderColor(COLOR_INK_300)
              .backgroundColor(COLOR_PAPER_100)
              .borderRadius(RADIUS_CELL)
              .height(SPACE_9)
              .padding({ left: SPACE_3, right: SPACE_3 })
          }
        }
        .width('100%')
        .padding({ left: SPACE_6, right: SPACE_6 })
        .margin({ top: SPACE_7 })

        if (this.errorMessage !== null) {
          Row() {
            Icon({ name: 'WARNING', iconSize: 16, color: COLOR_DANGER_600 })
            Text(this.errorMessage)
              .fontSize(TYPO_LABEL.size)
              .fontColor(COLOR_DANGER_600)
              .layoutWeight(1)
              .margin({ left: SPACE_1 })
          }
          .width('100%')
          .padding({ left: SPACE_3, right: SPACE_3, top: SPACE_2, bottom: SPACE_2 })
          .backgroundColor('rgba(155, 81, 81, 0.08)')
          .borderRadius(RADIUS_CELL)
          .margin({ left: SPACE_6, right: SPACE_6, top: SPACE_3 })
        }

        Button(this.isRegisterMode ? '注册' : '登录', { type: ButtonType.Capsule })
          .backgroundColor(COLOR_ACCENT_SAGE_500)
          .fontColor(COLOR_PAPER_50)
          .fontSize(TYPO_LABEL.size)
          .fontWeight(TYPO_LABEL.weight)
          .borderRadius(RADIUS_PILL)
          .width('100%')
          .height(SPACE_9)
          .margin({ left: SPACE_6, right: SPACE_6, top: SPACE_4 })
          .enabled(
            !this.isLoading &&
            this.username.trim().length > 0 &&
            this.password.length > 0 &&
            (!this.isRegisterMode || this.confirmPassword.length > 0)
          )
          .opacity(this.isLoading ? 0.6 : 1.0)
          .onClick(() => {
            if (this.isRegisterMode) {
              this.handleRegister();
            } else {
              this.handleLogin();
            }
          })

        Text(this.isRegisterMode ? '已有账号？去登录' : '没有账号？去注册')
          .fontSize(TYPO_LABEL.size)
          .fontColor(COLOR_ACCENT_SAGE_500)
          .textAlign(TextAlign.Center)
          .width('100%')
          .margin({ top: SPACE_4 })
          .onClick(() => { this.toggleMode(); })
      }
      .width('100%')
      .justifyContent(FlexAlign.Start)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(COLOR_PAPER_50)
    .scrollable(ScrollDirection.Vertical)
    .scrollBar(BarState.Off)
  }
}
