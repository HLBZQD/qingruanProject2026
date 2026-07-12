import { ChatKind, ChatMessage } from '../types/sse';
import { ChatStore, SendMessageOptions } from '../stores/ChatStore';
import { MarkdownViewer } from './MarkdownViewer';
import { Icon } from './Icon';
import {
  COLOR_PAPER_50,
  COLOR_PAPER_100,
  COLOR_INK_200,
  COLOR_INK_400,
  COLOR_ACCENT_SAGE_500,
  COLOR_DANGER_600,
  TYPO_BODY,
  TYPO_LABEL,
  RADIUS_HERO,
  RADIUS_CELL,
  RADIUS_PILL,
  SPACE_1,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_9
} from '../common/constants/DesignTokens';

interface AiChatDialogProps {
  kind: ChatKind;
  onClose: () => void;
  onNavigate?: (target: string) => void;
  doctorId?: number;
}

@Component
export struct AiChatDialog {
  static readonly MODE_TITLES: Record<ChatKind, string> = {
    'assistant': 'AI 健康助手',
    'doctor': '医师咨询',
    'admin': '管理员'
  };

  static readonly MODE_WELCOME: Record<ChatKind, string | null> = {
    'assistant': '您好，我是您的 AI 健康助手，有什么可以帮您的？',
    'doctor': null,
    'admin': null
  };

  static readonly MODE_DISCLAIMER: Record<ChatKind, string | null> = {
    'assistant': 'AI 建议仅供参考，不构成医疗诊断',
    'doctor': null,
    'admin': null
  };

  @Prop @Watch('onKindChange') kind: ChatKind = 'assistant';
  doctorId?: number = undefined;
  onClose: () => void = () => {};
  onNavigate?: (target: string) => void = undefined;

  @State inputText: string = '';
  @State doctorInfo: string = '';
  @State adminHint: string = '';
  private scroller: Scroller = new Scroller();
  private isLoadingPrev: boolean = false;

  aboutToAppear(): void {
    this.isLoadingPrev = ChatStore.getInstance().isLoading(this.kind);
  }

  aboutToUpdate(): void {
    this.checkNavigateIntent();
    this.scroller.scrollEdge(Edge.Bottom);
  }

  onKindChange(): void {
    this.isLoadingPrev = ChatStore.getInstance().isLoading(this.kind);
    this.inputText = '';
  }

  handleSend(): void {
    if (this.inputText.trim().length === 0) {
      return;
    }
    if (ChatStore.getInstance().isLoading(this.kind)) {
      return;
    }
    const text = this.inputText.trim();
    this.inputText = '';
      const opts: SendMessageOptions = { doctorId: this.kind === 'doctor' ? this.doctorId : undefined };
    ChatStore.getInstance().sendMessage(this.kind, text, opts);
    focusControl.requestFocus('aiChatInput');
  }

  handleRetry(): void {
    const messages = ChatStore.getInstance().getMessages(this.kind);
    let lastUserMessage: ChatMessage | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMessage = messages[i];
        break;
      }
    }
    if (lastUserMessage !== null) {
    const opts: SendMessageOptions = { doctorId: this.kind === 'doctor' ? this.doctorId : undefined }; 
      ChatStore.getInstance().sendMessage(this.kind, lastUserMessage.content, opts);
    }
  }

  clearMessages(): void {
    ChatStore.getInstance().clearMessages(this.kind);
  }

  checkNavigateIntent(): void {
    const currentLoading = ChatStore.getInstance().isLoading(this.kind);
    if (this.isLoadingPrev && !currentLoading) {
      const messages = ChatStore.getInstance().getMessages(this.kind);
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === 'assistant') {
          const target = ChatStore.parseNavigateIntent(lastMsg.content);
          if (target !== null) {
            if (this.onNavigate !== undefined) {
              this.onNavigate(target);
            }
            this.onClose();
            return;
          }
        }
      }
    }
    this.isLoadingPrev = currentLoading;
  }

  build() {
    Column() {
      if (this.kind === 'assistant') {
        Row()
          .width('100%')
          .layoutWeight(1)
          .onClick(() => { this.onClose(); })
      }
      Column() {
        Row() {
          if (this.kind === 'assistant') {
            Blank()
          } else {
            Icon({ name: 'BACK' })
              .onClick(() => { this.onClose(); })
          }

          Text(AiChatDialog.MODE_TITLES[this.kind])
            .layoutWeight(1)
            .textAlign(TextAlign.Center)
            .fontSize(TYPO_BODY.size)
            .fontWeight(TYPO_BODY.weight)

          if (this.kind === 'assistant') {
            Icon({ name: 'CLOSE' })
              .onClick(() => { this.onClose(); })
          } else {
            Icon({ name: 'REFRESH' })
              .onClick(() => { this.clearMessages(); })
          }
        }
        .width('100%')
        .height(SPACE_9)
        .padding({ left: SPACE_4, right: SPACE_4 })

        Divider()
          .strokeWidth(0.5)
          .color(COLOR_INK_200)

        if (this.kind === 'doctor' && this.doctorInfo.length > 0) {
          Row() {
            Text(this.doctorInfo)
          }
          .width('100%')
          .padding({ left: SPACE_4, right: SPACE_4, top: SPACE_2, bottom: SPACE_2 })
        }

        if (this.kind === 'admin') {
          Row() {
            Text('管理后台对话')
          }
          .width('100%')
          .padding({ left: SPACE_4, right: SPACE_4, top: SPACE_2, bottom: SPACE_2 })
        }

        List({ scroller: this.scroller }) {
          ForEach(ChatStore.getInstance().getMessages(this.kind), (msg: ChatMessage, index: number) => {
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
                    MarkdownViewer({ markdown: msg.content })
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
          }, (msg: ChatMessage) => msg.id)

          if (ChatStore.getInstance().isLoading(this.kind)) {
            ListItem() {
              Row() {
                Text('...')
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
          TextInput({ placeholder: '输入您的问题...', text: $$this.inputText })
            .type(InputType.Normal)
            .onChange((value: string) => { this.inputText = value; })
            .id('aiChatInput')
            .layoutWeight(1)
            .height(40)

          Button('发送')
            .enabled(!ChatStore.getInstance().isLoading(this.kind) && this.inputText.trim().length > 0)
            .borderRadius(RADIUS_PILL)
            .onClick(() => { this.handleSend(); })
        }
        .width('100%')
        .padding(SPACE_3)
      }
      .width('100%')
      .layoutWeight(1)
      .backgroundColor(COLOR_PAPER_50)
      .borderRadius({ topLeft: RADIUS_HERO, topRight: RADIUS_HERO })
      .alignItems(HorizontalAlign.Start)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.kind === 'assistant' ? 'rgba(24,24,24,0.4)' : Color.Transparent)
    .expandSafeArea([SafeAreaType.KEYBOARD], [SafeAreaEdge.BOTTOM])
  }
}
