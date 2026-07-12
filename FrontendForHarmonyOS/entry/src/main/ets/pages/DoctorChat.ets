import { router, window } from '@kit.ArkUI';
import { ChatMessage, ChatKind } from '../types/sse';
import { ChatStore, SendMessageOptions } from '../stores/ChatStore';
import { AuthStore } from '../stores/AuthStore';
import { HomeStore } from '../stores/HomeStore';
import { Doctor } from '../types/models';
import { MarkdownViewer } from '../components/MarkdownViewer';
import { Icon } from '../components/Icon';
import {
  COLOR_PAPER_50,
  COLOR_PAPER_100,
  COLOR_INK_200,
  COLOR_INK_400,
  COLOR_ACCENT_SAGE_500,
  COLOR_DANGER_600,
  TYPO_BODY,
  TYPO_LABEL,
  RADIUS_CELL,
  RADIUS_PILL,
  SPACE_1,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_9
} from '../common/constants/DesignTokens';

interface DoctorChatParams {
  doctor_id: number;
}

let lastDoctorChatId: number = 0;

@Entry
@Component
struct DoctorChatPage {
  @State messages: ChatMessage[] = [];
  @State inputText: string = '';
  @State isLoading: boolean = false;
  @State keyboardHeight: number = 0;
  @State doctorTitle: string = '医师咨询';
  private doctorId: number = 0;
  private scroller: Scroller = new Scroller();

  aboutToAppear(): void {
    const params = router.getParams() as DoctorChatParams | undefined;
    if (params !== undefined && params.doctor_id !== undefined && params.doctor_id !== null) {
      this.doctorId = params.doctor_id;
    }
    if (this.doctorId !== lastDoctorChatId) {
      ChatStore.getInstance().clearMessages('doctor');
      lastDoctorChatId = this.doctorId;
    }
    this.resolveDoctorTitle();
    this.syncFromStore();
    ChatStore.getInstance().subscribe(this.onMessagesChanged);
    try {
      window.getLastWindow(getContext(this)).then((win: window.Window) => {
        win.on('keyboardHeightChange', (height: number) => {
          this.keyboardHeight = px2vp(height);
        });
      });
    } catch (_e) { /* ignore */ }
  }

  aboutToDisappear(): void {
    ChatStore.getInstance().unsubscribe(this.onMessagesChanged);
    try {
      window.getLastWindow(getContext(this)).then((win: window.Window) => {
        win.off('keyboardHeightChange');
      });
    } catch (_e) { /* ignore */ }
  }

  aboutToUpdate(): void {
    this.scroller.scrollEdge(Edge.Bottom);
  }

  private resolveDoctorTitle(): void {
    const doctors: Doctor[] = HomeStore.getInstance().getDoctors();
    for (let i = 0; i < doctors.length; i++) {
      if (doctors[i].id === this.doctorId) {
        this.doctorTitle = doctors[i].name;
        return;
      }
    }
  }

  syncFromStore(): void {
    this.messages = [...ChatStore.getInstance().getMessages('doctor')];
    this.isLoading = ChatStore.getInstance().isLoading('doctor');
  }

  onMessagesChanged: (kind: ChatKind) => void = (kind: ChatKind) => {
    if (kind === 'doctor') {
      this.syncFromStore();
    }
  };

  handleSend(): void {
    if (this.inputText.trim().length === 0) {
      return;
    }
    if (this.isLoading) {
      return;
    }
    if (this.doctorId <= 0) {
      return;
    }
    const text: string = this.inputText.trim();
    this.inputText = '';
    const opts: SendMessageOptions = { doctorId: this.doctorId };
    ChatStore.getInstance().sendMessage('doctor', text, opts);
  }

  async handleGoLogin(): Promise<void> {
    await AuthStore.getInstance().clearAuth();
    router.replaceUrl({ url: 'pages/Login' });
  }

  handleRetry(): void {
    const messages: ChatMessage[] = this.messages;
    let lastUserMessage: ChatMessage | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMessage = messages[i];
        break;
      }
    }
    if (lastUserMessage !== null && this.doctorId > 0) {
      const opts: SendMessageOptions = { doctorId: this.doctorId };
      ChatStore.getInstance().sendMessage('doctor', lastUserMessage.content, opts);
    }
  }

  handleClear(): void {
    AlertDialog.show({
      title: '清空对话',
      message: '确定要清空所有聊天记录吗？',
      primaryButton: {
        value: '取消',
        action: () => {}
      },
      secondaryButton: {
        value: '确定',
        fontColor: COLOR_DANGER_600,
        action: () => { ChatStore.getInstance().clearMessages('doctor'); }
      }
    });
  }

  build() {
    Column() {
      Row() {
        Icon({ name: 'BACK' })
          .onClick(() => { router.back(); })

        Text(this.doctorTitle)
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
          .fontSize(TYPO_BODY.size)
          .fontWeight(TYPO_BODY.weight)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })

        Icon({ name: 'TRASH' })
          .onClick(() => { this.handleClear(); })
      }
      .width('100%')
      .height(SPACE_9)
      .padding({ left: SPACE_4, right: SPACE_4 })

      Divider()
        .strokeWidth(0.5)
        .color(COLOR_INK_200)

      if (ChatStore.getInstance().getError('doctor') !== null) {
        Row() {
          Text(ChatStore.getInstance().getError('doctor')!)
            .fontColor(COLOR_DANGER_600)
            .fontSize(TYPO_LABEL.size)
            .layoutWeight(1)
          if (ChatStore.getInstance().isAuthError('doctor')) {
            Button('去登录')
              .fontColor(COLOR_PAPER_50)
              .backgroundColor(COLOR_ACCENT_SAGE_500)
              .borderRadius(RADIUS_PILL)
              .onClick(() => { this.handleGoLogin(); })
          }
          Button('重试')
            .fontColor(COLOR_PAPER_50)
            .backgroundColor(COLOR_DANGER_600)
            .borderRadius(RADIUS_PILL)
            .margin({ left: SPACE_2 })
            .onClick(() => { this.handleRetry(); })
        }
        .width('100%')
        .padding({ left: SPACE_3, right: SPACE_3, top: SPACE_1, bottom: SPACE_1 })
      }

      List({ scroller: this.scroller }) {
        ForEach(this.messages, (msg: ChatMessage, index: number) => {
          ListItem() {
            if (msg.role === 'user') {
              Row() {
                Text(msg.content)
                  .backgroundColor(COLOR_ACCENT_SAGE_500)
                  .fontColor(COLOR_PAPER_50)
                  .borderRadius(RADIUS_CELL)
                  .padding({ left: SPACE_3, right: SPACE_3, top: SPACE_2, bottom: SPACE_2 })
                  .fontSize(TYPO_BODY.size)
                  .fontWeight(TYPO_BODY.weight)
                  .constraintSize({ maxWidth: '80%' })
              }
              .justifyContent(FlexAlign.End)
              .width('100%')
              .padding({ left: SPACE_3, right: SPACE_3, top: SPACE_1, bottom: SPACE_1 })
            } else {
              Row() {
                Column() {
                  MarkdownViewer({ markdown: msg.content, fullWidth: false })
                }
                .backgroundColor(COLOR_PAPER_100)
                .borderRadius(RADIUS_CELL)
                .border({ width: 1, color: COLOR_INK_200 })
                .constraintSize({ maxWidth: '85%' })
              }
              .justifyContent(FlexAlign.Start)
              .width('100%')
              .padding({ left: SPACE_3, right: SPACE_3, top: SPACE_1, bottom: SPACE_1 })
            }
          }
        }, (msg: ChatMessage, index: number) => index.toString() + '_' + msg.content.length.toString())

        if (this.isLoading) {
          ListItem() {
            Row() {
              Text('...')
                .fontSize(TYPO_BODY.size)
                .fontColor(COLOR_INK_400)
            }
            .width('100%')
            .padding({ left: SPACE_3 })
          }
        }
      }
      .layoutWeight(1)
      .backgroundColor(COLOR_PAPER_50)
      .width('100%')

      Row() {
        TextInput({ text: $$this.inputText, placeholder: '输入您的问题...' })
          .type(InputType.Normal)
          .defaultFocus(true)
          .layoutWeight(1)
          .height(40)

        Button('发送')
          .enabled(!this.isLoading && this.inputText.trim().length > 0)
          .borderRadius(RADIUS_PILL)
          .onClick(() => { this.handleSend(); })
      }
      .width('100%')
      .padding(SPACE_3)
      .margin({ bottom: this.keyboardHeight })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(COLOR_PAPER_50)
    .expandSafeArea([SafeAreaType.KEYBOARD], [SafeAreaEdge.BOTTOM])
  }

  pageTransition(): void {
    PageTransitionEnter({ duration: 300, curve: Curve.EaseOut }).slide(SlideEffect.Right).opacity(0)
    PageTransitionExit({ duration: 250, curve: Curve.EaseIn }).slide(SlideEffect.Right).opacity(0)
  }
}
