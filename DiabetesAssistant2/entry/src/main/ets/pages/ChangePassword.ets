import { router } from '@kit.ArkUI';
import { AuthStore } from '../stores/AuthStore';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import {
  COLOR_PAPER_50, COLOR_PAPER_100,
  COLOR_INK_700, COLOR_INK_400, COLOR_INK_300,
  COLOR_DANGER_600, COLOR_SUCCESS_600,
  COLOR_ACCENT_SAGE_500,
  TYPO_BODY, TYPO_LABEL,
  SPACE_1, SPACE_2, SPACE_3, SPACE_4, SPACE_7, SPACE_9,
  STROKE_HAIRLINE,
  RADIUS_CELL, RADIUS_PILL
} from '../common/constants/DesignTokens';

@Builder
export function ChangePasswordPageBuilder(): void {
  ChangePasswordPage()
}

@Entry
@Component
export struct ChangePasswordPage {
  @State newPassword: string = '';
  @State confirmPassword: string = '';
  @State oldPassword: string = '';
  @State isLoading: boolean = false;
  @State isSuccess: boolean = false;
  @State errorMessage: string | null = null;
  @State successMessage: string | null = null;
  @State isForcedChange: boolean = false;

  private redirectTarget: string | null = null;

  aboutToAppear(): void {
    const params = router.getParams() as Record<string, Object> | undefined;
    if (params !== undefined) {
      this.redirectTarget = (params['redirect'] as string) ?? null;
    }
    this.isForcedChange = AuthStore.getInstance().mustChangePassword;
  }

  async handleChangePassword(): Promise<void> {
    if (this.isSuccess) {
      return;
    }

    const validationError = validatePasswordChange(
      this.newPassword,
      this.confirmPassword,
      this.isForcedChange ? null : this.oldPassword,
      this.isForcedChange
    );
    if (validationError !== null) {
      this.errorMessage = validationError;
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;

    try {
      const authStore = AuthStore.getInstance();
      const useOldPassword: string | undefined = this.isForcedChange ? undefined : this.oldPassword;
      await authStore.changePassword(this.newPassword, useOldPassword);
      this.isSuccess = true;
      this.successMessage = '密码修改成功';
      setTimeout(() => {
        this.navigateAfterChange();
      }, 800);
    } catch (e) {
      this.errorMessage = (e as Error).message ?? '修改失败，请重试';
    } finally {
      this.isLoading = false;
    }
  }

  navigateAfterChange(): void {
    if (this.redirectTarget !== null) {
      router.replaceUrl({ url: 'pages/' + this.redirectTarget });
    } else {
      router.back();
    }
  }

  build() {
    Column() {
      PageHeader({ title: '修改密码', showBack: !this.isForcedChange })

      Scroll() {
        Column() {
          if (this.isForcedChange) {
            Text('首次登录需修改密码后方可使用')
              .fontSize(TYPO_BODY.size)
              .fontWeight(TYPO_BODY.weight)
              .fontColor(COLOR_INK_400)
              .textAlign(TextAlign.Center)
              .width('100%')
              .margin({ top: SPACE_4 })
          }

          Column({ space: SPACE_4 }) {
            if (!this.isForcedChange) {
              TextInput({ placeholder: '当前密码', text: $$this.oldPassword })
                .type(InputType.Password)
                .fontSize(TYPO_BODY.size)
                .fontColor(COLOR_INK_700)
                .placeholderColor(COLOR_INK_300)
                .backgroundColor(COLOR_PAPER_100)
                .borderRadius(RADIUS_CELL)
                .height(SPACE_9)
                .padding({ left: SPACE_3, right: SPACE_3 })
            }
            TextInput({ placeholder: '新密码（至少6位）', text: $$this.newPassword })
              .type(InputType.Password)
              .fontSize(TYPO_BODY.size)
              .fontColor(COLOR_INK_700)
              .placeholderColor(COLOR_INK_300)
              .backgroundColor(COLOR_PAPER_100)
              .borderRadius(RADIUS_CELL)
              .height(SPACE_9)
              .padding({ left: SPACE_3, right: SPACE_3 })
            TextInput({ placeholder: '确认新密码', text: $$this.confirmPassword })
              .type(InputType.Password)
              .fontSize(TYPO_BODY.size)
              .fontColor(COLOR_INK_700)
              .placeholderColor(COLOR_INK_300)
              .backgroundColor(COLOR_PAPER_100)
              .borderRadius(RADIUS_CELL)
              .height(SPACE_9)
              .padding({ left: SPACE_3, right: SPACE_3 })

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
            }

            if (this.successMessage !== null) {
              Row() {
                Icon({ name: 'CHECK', iconSize: 16, color: COLOR_SUCCESS_600 })
                Text(this.successMessage)
                  .fontSize(TYPO_LABEL.size)
                  .fontColor(COLOR_SUCCESS_600)
                  .layoutWeight(1)
                  .margin({ left: SPACE_1 })
              }
              .width('100%')
              .padding({ left: SPACE_3, right: SPACE_3, top: SPACE_2, bottom: SPACE_2 })
              .backgroundColor('rgba(91, 117, 96, 0.08)')
              .borderRadius(RADIUS_CELL)
            }

            Button('确认修改', { type: ButtonType.Capsule })
              .backgroundColor(COLOR_ACCENT_SAGE_500)
              .fontColor(COLOR_PAPER_50)
              .fontSize(TYPO_LABEL.size)
              .fontWeight(TYPO_LABEL.weight)
              .borderRadius(RADIUS_PILL)
              .width('100%')
              .height(SPACE_9)
              .margin({ top: SPACE_2 })
              .enabled(
                !this.isLoading &&
                !this.isSuccess &&
                this.newPassword.length >= 6 &&
                this.confirmPassword.length >= 6 &&
                (this.isForcedChange || this.oldPassword.length > 0)
              )
              .opacity(this.isLoading ? 0.6 : 1.0)
              .onClick(() => { this.handleChangePassword(); })
          }
          .width('100%')
          .backgroundColor(COLOR_PAPER_50)
          .borderRadius(RADIUS_CELL)
          .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
          .padding(SPACE_4)
          .margin({ left: SPACE_4, right: SPACE_4, top: SPACE_4 })
        }
        .width('100%')
        .justifyContent(FlexAlign.Start)
      }
      .width('100%')
      .layoutWeight(1)
      .scrollable(ScrollDirection.Vertical)
      .scrollBar(BarState.Off)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(COLOR_PAPER_100)
  }

  pageTransition(): void {
    PageTransitionEnter({ duration: 300, curve: Curve.EaseOut }).slide(SlideEffect.Right).opacity(0)
    PageTransitionExit({ duration: 250, curve: Curve.EaseIn }).slide(SlideEffect.Right).opacity(0)
  }
}

export function validatePasswordChange(
  newPassword: string,
  confirmPassword: string,
  oldPassword: string | null,
  isForced: boolean
): string | null {
  if (newPassword.length < 6) {
    return '新密码长度不能少于6位';
  }
  if (newPassword !== confirmPassword) {
    return '两次输入的密码不一致';
  }
  if (!isForced && (oldPassword === null || oldPassword.length === 0)) {
    return '请输入当前密码';
  }
  if (!isForced && oldPassword !== null && oldPassword === newPassword) {
    return '新密码不能与当前密码相同';
  }
  return null;
}
