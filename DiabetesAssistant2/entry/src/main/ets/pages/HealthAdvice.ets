import { AuthStore } from '../stores/AuthStore';
import { HealthAdvice } from '../types/models';
import { API_HEALTH_ADVICE } from '../common/constants/ApiEndpoints';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { FadeInUp } from '../components/FadeInUp';
import { MarkdownViewer } from '../components/MarkdownViewer';
import {
  COLOR_PAPER_50, COLOR_PAPER_100,
  COLOR_ACCENT_SAGE_500, COLOR_ACCENT_MIST_500,
  COLOR_DANGER_600,
  COLOR_INK_700, COLOR_INK_600, COLOR_INK_500, COLOR_INK_400,
  TYPO_SUBTITLE, TYPO_BODY, TYPO_LABEL, TYPO_CAPTION,
  RADIUS_CELL, RADIUS_PILL, RADIUS_TAG,
  STROKE_HAIRLINE,
  SPACE_1, SPACE_2, SPACE_3, SPACE_4, SPACE_7, SPACE_9
} from '../common/constants/DesignTokens';

interface HealthAdviceListResponse {
  data: HealthAdvice[];
}

@Entry
@Component
struct HealthAdvicePage {
  @State advices: HealthAdvice[] = [];
  @State isLoading: boolean = true;
  @State error: string | null = null;
  @State expandedId: number = -1;

  aboutToAppear(): void {
    this.loadAdvices();
  }

  async loadAdvices(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      const client = AuthStore.getInstance().getHttpClient();
      const response = await client.request<HealthAdviceListResponse>('GET', API_HEALTH_ADVICE, null);
      this.advices = response.data ?? [];
    } catch (e) {
      this.error = (e as Error).message ?? '加载失败';
    } finally {
      this.isLoading = false;
    }
  }

  @Builder
  AdviceCard(advice: HealthAdvice) {
    Column() {
      Row() {
        Text(advice.title)
          .fontSize(TYPO_SUBTITLE.size).fontWeight(TYPO_SUBTITLE.weight)
          .fontColor(COLOR_INK_700).layoutWeight(1)
        Icon({ name: this.expandedId === advice.id ? 'CHEVRON_LEFT' : 'CHEVRON_RIGHT', iconSize: 16, color: COLOR_INK_400 })
          .rotate({ angle: this.expandedId === advice.id ? 90 : 0 })
      }
      .width('100%')
      if (advice.tags.length > 0) {
        Row({ space: SPACE_1 }) {
          ForEach(advice.tags, (tag: string) => {
            Text(tag)
              .fontSize(10).fontColor(COLOR_ACCENT_MIST_500)
              .backgroundColor(COLOR_PAPER_100)
              .borderRadius(RADIUS_TAG)
              .padding({ left: SPACE_2, right: SPACE_2, top: 2, bottom: 2 })
          })
        }
        .width('100%')
        .margin({ top: SPACE_1 })
      }
      if (this.expandedId === advice.id) {
        MarkdownViewer({ markdown: advice.content })
      } else {
        Text(advice.content)
          .fontSize(TYPO_BODY.size).fontColor(COLOR_INK_500)
          .width('100%').maxLines(3).textOverflow({ overflow: TextOverflow.Ellipsis })
          .margin({ top: SPACE_2 })
      }
      Row() {
        Text(advice.created_at.slice(0, 10))
          .fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_400)
        Blank()
        Text(this.expandedId === advice.id ? '收起' : '查看全文')
          .fontSize(TYPO_CAPTION.size).fontColor(COLOR_ACCENT_SAGE_500)
      }
      .width('100%').margin({ top: SPACE_2 })
    }
    .width('100%')
    .backgroundColor(COLOR_PAPER_50)
    .borderRadius(RADIUS_CELL)
    .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
    .padding(SPACE_4)
    .onClick(() => {
      this.expandedId = this.expandedId === advice.id ? -1 : advice.id;
    })
  }

  build() {
    Column() {
      PageHeader({ title: '健康建议' })

      Scroll() {
        Column() {
          if (this.isLoading) {
          Column({ space: SPACE_3 }) {
            SkeletonLoader({ variant: 'lines', count: 3, lineHeight: SPACE_7 })
            SkeletonLoader({ variant: 'lines', count: 3, lineHeight: SPACE_7 })
          }
          .width('100%').padding({ left: SPACE_4, right: SPACE_4, top: SPACE_3 })
        } else if (this.error !== null) {
          Column() {
            Text(this.error)
              .fontSize(TYPO_BODY.size).fontColor(COLOR_DANGER_600)
              .textAlign(TextAlign.Center).margin({ bottom: SPACE_3 })
            Button('重试')
              .fontSize(TYPO_BODY.size).backgroundColor(COLOR_ACCENT_SAGE_500).fontColor(COLOR_PAPER_50)
              .borderRadius(RADIUS_PILL).onClick(() => { this.loadAdvices(); })
          }
          .width('100%').padding(SPACE_4).margin({ top: SPACE_9 })
          .alignItems(HorizontalAlign.Center)
        } else if (this.advices.length === 0) {
          Text('暂无健康建议')
            .fontSize(TYPO_BODY.size).fontColor(COLOR_INK_400)
            .width('100%').textAlign(TextAlign.Center).margin({ top: SPACE_9 })
        } else {
          Column({ space: SPACE_3 }) {
            ForEach(this.advices, (advice: HealthAdvice, index: number) => {
              FadeInUp({ index: index }) {
                this.AdviceCard(advice)
              }
            })
          }
          .width('100%').padding({ left: SPACE_4, right: SPACE_4 }).margin({ top: SPACE_3 })
        }

        Blank().height(SPACE_9)
        }
      }
      .scrollable(ScrollDirection.Vertical).scrollBar(BarState.Off)
      .layoutWeight(1)
    }
    .backgroundColor(COLOR_PAPER_100).width('100%').height('100%')
  }

  pageTransition(): void {
    PageTransitionEnter({ duration: 300, curve: Curve.EaseOut }).slide(SlideEffect.Right).opacity(0)
    PageTransitionExit({ duration: 250, curve: Curve.EaseIn }).slide(SlideEffect.Right).opacity(0)
  }
}
