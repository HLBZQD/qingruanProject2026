import { AuthStore } from '../stores/AuthStore';
import { ChatStore } from '../stores/ChatStore';
import { ChatMessage, ChatKind } from '../types/sse';
import { AdminLog } from '../types/models';
import { API_ADMIN_LOGS } from '../common/constants/ApiEndpoints';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { MarkdownViewer } from '../components/MarkdownViewer';
import {
  COLOR_PAPER_50, COLOR_PAPER_100,
  COLOR_ACCENT_SAGE_500, COLOR_ACCENT_CLAY_500,
  COLOR_DANGER_600,
  COLOR_INK_700, COLOR_INK_600, COLOR_INK_500, COLOR_INK_400, COLOR_INK_300, COLOR_INK_200,
  TYPO_TITLE, TYPO_SUBTITLE, TYPO_BODY, TYPO_LABEL, TYPO_CAPTION,
  RADIUS_CELL, RADIUS_PILL, RADIUS_TAG, RADIUS_CARD_OUTER,
  STROKE_HAIRLINE,
  SPACE_1, SPACE_2, SPACE_3, SPACE_4, SPACE_7, SPACE_9
} from '../common/constants/DesignTokens';

interface AdminLogsResponse {
  data: AdminLog[];
}

@Entry
@Component
struct AdminPage {
  @State chatInput: string = '';
  @State messages: ChatMessage[] = [];
  @State isLoadingChat: boolean = false;
  @State logs: AdminLog[] = [];
  @State isLoadingLogs: boolean = true;
  @State error: string | null = null;
  @State showLogs: boolean = false;
  private scroller: Scroller = new Scroller();

  aboutToAppear(): void {
    this.loadLogs();
    this.syncFromStore();
    ChatStore.getInstance().subscribe(this.onMessagesChanged);
  }

  aboutToDisappear(): void {
    ChatStore.getInstance().unsubscribe(this.onMessagesChanged);
  }

  syncFromStore(): void {
    this.messages = [...ChatStore.getInstance().getMessages('admin')];
    this.isLoadingChat = ChatStore.getInstance().isLoading('admin');
  }

  onMessagesChanged: (kind: ChatKind) => void = (kind: ChatKind) => {
    if (kind === 'admin') {
      const wasLoading: boolean = this.isLoadingChat;
      this.syncFromStore();
      if (wasLoading && !this.isLoadingChat) {
        this.loadLogs();
      }
    }
  };

  async loadLogs(): Promise<void> {
    this.isLoadingLogs = true;
    try {
      const client = AuthStore.getInstance().getHttpClient();
      const response = await client.request<AdminLogsResponse>('GET', API_ADMIN_LOGS, null);
      this.logs = response.data ?? [];
    } catch (e) {
      this.error = (e as Error).message ?? '加载日志失败';
    } finally {
      this.isLoadingLogs = false;
    }
  }

  sendChat(): void {
    const text: string = this.chatInput.trim();
    if (text.length === 0 || this.isLoadingChat) {
      return;
    }
    this.chatInput = '';
    ChatStore.getInstance().sendMessage('admin', text);
  }

  aboutToUpdate(): void {
    this.scroller.scrollEdge(Edge.Bottom);
  }

  operationLabel(op: string): string {
    if (op === 'INSERT') { return '新增'; }
    if (op === 'UPDATE') { return '更新'; }
    if (op === 'DELETE') { return '删除'; }
    return '查询';
  }

  operationColor(op: string): string {
    if (op === 'INSERT') { return COLOR_ACCENT_SAGE_500; }
    if (op === 'UPDATE') { return COLOR_ACCENT_CLAY_500; }
    if (op === 'DELETE') { return COLOR_DANGER_600; }
    return COLOR_INK_500;
  }

  @Builder
  HistoryButton() {
    Column() {
      Icon({ name: 'VIEW', iconSize: 22, color: COLOR_INK_500 })
    }
    .width(40).height(40)
    .justifyContent(FlexAlign.Center).alignItems(HorizontalAlign.Center)
    .onClick(() => { this.showLogs = true; this.loadLogs(); })
  }

  @Builder
  MessageBubble(msg: ChatMessage) {
    if (msg.role === 'user') {
      Row() {
        Text(msg.content)
          .fontSize(TYPO_BODY.size).fontColor(COLOR_PAPER_50)
          .backgroundColor(COLOR_ACCENT_SAGE_500)
          .borderRadius(RADIUS_CELL)
          .padding({ left: SPACE_3, right: SPACE_3, top: SPACE_2, bottom: SPACE_2 })
          .constraintSize({ maxWidth: '85%' })
      }
      .width('100%').justifyContent(FlexAlign.End)
      .padding({ left: SPACE_4, right: SPACE_4, top: SPACE_1, bottom: SPACE_1 })
    } else {
      Row() {
        Column() {
          MarkdownViewer({ markdown: msg.content, fullWidth: false })
        }
        .backgroundColor(COLOR_PAPER_50)
        .borderRadius(RADIUS_CELL)
        .border({ width: 1, color: COLOR_INK_200 })
        .constraintSize({ maxWidth: '90%' })
      }
      .width('100%').justifyContent(FlexAlign.Start)
      .padding({ left: SPACE_4, right: SPACE_4, top: SPACE_1, bottom: SPACE_1 })
    }
  }

  @Builder
  EmptyChatHint() {
    Column() {
      Icon({ name: 'CHAT', iconSize: 48, color: COLOR_INK_300 })
      Text('AI 管理助手')
        .fontSize(TYPO_TITLE.size).fontWeight(TYPO_TITLE.weight).fontColor(COLOR_INK_600)
        .margin({ top: SPACE_3 })
      Text('用自然语言查询或管理数据，例如\n"查询最近注册的用户"')
        .fontSize(TYPO_BODY.size).fontColor(COLOR_INK_400)
        .textAlign(TextAlign.Center).margin({ top: SPACE_2 })
    }
    .width('100%').height('100%')
    .justifyContent(FlexAlign.Center).alignItems(HorizontalAlign.Center)
    .padding(SPACE_9)
  }

  @Builder
  LogsOverlay() {
    Column() {
      Column() {
        Row() {
          Text('操作日志')
            .fontSize(TYPO_TITLE.size).fontWeight(TYPO_TITLE.weight).fontColor(COLOR_INK_700)
            .layoutWeight(1)
          Column() {
            Icon({ name: 'CLOSE', iconSize: 20, color: COLOR_INK_500 })
          }
          .width(32).height(32).justifyContent(FlexAlign.Center).alignItems(HorizontalAlign.Center)
          .onClick(() => { this.showLogs = false; })
        }
        .width('100%').margin({ bottom: SPACE_2 })

        if (this.isLoadingLogs) {
          SkeletonLoader({ variant: 'lines', count: 5, lineHeight: SPACE_7 })
        } else if (this.logs.length === 0) {
          Text('暂无操作记录')
            .fontSize(TYPO_BODY.size).fontColor(COLOR_INK_400)
            .textAlign(TextAlign.Center).width('100%').margin({ top: SPACE_7 })
        } else {
          Scroll() {
            Column() {
              ForEach(this.logs.slice(0, 50), (log: AdminLog) => {
                Row() {
                  Column() {
                    Text(log.operator_username)
                      .fontSize(TYPO_BODY.size).fontColor(COLOR_INK_700)
                    Text(log.operation_time.slice(0, 16).replace('T', ' '))
                      .fontSize(10).fontColor(COLOR_INK_400).margin({ top: 2 })
                  }
                  .alignItems(HorizontalAlign.Start)
                  Blank()
                  Text(this.operationLabel(log.operation_type))
                    .fontSize(TYPO_CAPTION.size).fontColor(this.operationColor(log.operation_type))
                    .backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_TAG)
                    .padding({ left: SPACE_2, right: SPACE_2, top: 2, bottom: 2 })
                }
                .width('100%')
                .padding({ top: SPACE_2, bottom: SPACE_2 })
                .border({ width: { bottom: STROKE_HAIRLINE.width }, color: STROKE_HAIRLINE.color })
              })
            }
          }
          .scrollable(ScrollDirection.Vertical).scrollBar(BarState.Off)
          .layoutWeight(1)
        }
      }
      .width('100%').height('70%')
      .backgroundColor(COLOR_PAPER_50)
      .borderRadius({ topLeft: RADIUS_CARD_OUTER, topRight: RADIUS_CARD_OUTER })
      .padding(SPACE_4)
    }
    .width('100%').height('100%')
    .justifyContent(FlexAlign.End)
    .backgroundColor('rgba(0,0,0,0.4)')
    .onClick(() => { this.showLogs = false; })
  }

  build() {
    Stack() {
      Column() {
        PageHeader({ title: '智能管理', trailing: (): void => { this.HistoryButton() } })

        List({ scroller: this.scroller }) {
          if (this.messages.length === 0 && !this.isLoadingChat) {
            ListItem() {
              this.EmptyChatHint()
            }
          }
          ForEach(this.messages, (msg: ChatMessage, index: number) => {
            ListItem() {
              this.MessageBubble(msg)
            }
          }, (msg: ChatMessage, index: number) => index.toString() + '_' + msg.content.length.toString())

          if (this.isLoadingChat) {
            ListItem() {
              Row() {
                Text('...')
                  .fontSize(TYPO_BODY.size).fontColor(COLOR_INK_400)
              }
              .width('100%').padding({ left: SPACE_4, top: SPACE_2 })
            }
          }
        }
        .layoutWeight(1)
        .width('100%')
        .backgroundColor(COLOR_PAPER_100)

        if (this.error !== null) {
          Text(this.error)
            .fontSize(TYPO_CAPTION.size).fontColor(COLOR_DANGER_600)
            .padding({ left: SPACE_4, right: SPACE_4, bottom: SPACE_1 })
        }

        Row() {
          TextInput({ placeholder: '输入管理指令...', text: this.chatInput })
            .fontSize(TYPO_BODY.size)
            .backgroundColor(COLOR_PAPER_100)
            .borderRadius(RADIUS_CELL)
            .height(SPACE_9)
            .padding({ left: SPACE_3 })
            .layoutWeight(1)
            .onChange((v: string) => { this.chatInput = v; })
            .onSubmit(() => { this.sendChat(); })
          Button('发送')
            .fontSize(TYPO_LABEL.size)
            .backgroundColor(COLOR_ACCENT_SAGE_500).fontColor(COLOR_PAPER_50)
            .borderRadius(RADIUS_PILL).height(SPACE_9).width(64)
            .margin({ left: SPACE_2 })
            .enabled(!this.isLoadingChat && this.chatInput.trim().length > 0)
            .onClick(() => { this.sendChat(); })
        }
        .width('100%')
        .padding(SPACE_3)
        .backgroundColor(COLOR_PAPER_50)
        .border({ width: { top: STROKE_HAIRLINE.width }, color: STROKE_HAIRLINE.color })
      }
      .backgroundColor(COLOR_PAPER_100).width('100%').height('100%')

      if (this.showLogs) {
        this.LogsOverlay()
      }
    }
    .width('100%').height('100%')
  }

  pageTransition(): void {
    PageTransitionEnter({ duration: 300, curve: Curve.EaseOut }).slide(SlideEffect.Right).opacity(0)
    PageTransitionExit({ duration: 250, curve: Curve.EaseIn }).slide(SlideEffect.Right).opacity(0)
  }
}
