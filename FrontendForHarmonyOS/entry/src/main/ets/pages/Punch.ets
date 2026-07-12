import { AuthStore } from '../stores/AuthStore';
import { PunchStore } from '../stores/PunchStore';
import { PunchAnalysisResponse, PunchAnalysisTrendDay } from '../types/api';
import { PunchRecord } from '../types/models';
import { API_PUNCH_ANALYSIS } from '../common/constants/ApiEndpoints';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { ErrorRetry } from '../components/ErrorRetry';
import { ProgressRing } from '../components/ProgressRing';
import {
  COLOR_PAPER_50, COLOR_PAPER_100,
  COLOR_ACCENT_SAGE_500, COLOR_ACCENT_CLAY_500, COLOR_ACCENT_MIST_500,
  COLOR_SUCCESS_600, COLOR_DANGER_600,
  COLOR_INK_700, COLOR_INK_600, COLOR_INK_500, COLOR_INK_400,
  TYPO_HEADLINE, TYPO_TITLE, TYPO_SUBTITLE, TYPO_BODY, TYPO_LABEL, TYPO_CAPTION,
  RADIUS_CELL, RADIUS_PILL,
  STROKE_HAIRLINE,
  SPACE_1, SPACE_2, SPACE_3, SPACE_4, SPACE_7, SPACE_9
} from '../common/constants/DesignTokens';

interface PunchAnalysisWrapper {
  data: PunchAnalysisResponse;
}

@Entry
@Component
struct PunchPage {
  @State analysis: PunchAnalysisResponse | null = null;
  @State isLoading: boolean = true;
  @State error: string | null = null;
  @State records: PunchRecord[] = [];
  @State recordFilter: string = 'all';
  private punchStore: PunchStore = PunchStore.getInstance();

  aboutToAppear(): void {
    this.loadAnalysis();
    this.loadRecords();
  }

  async loadRecords(): Promise<void> {
    await this.punchStore.loadPunchList();
    this.records = [...this.punchStore.getPunchData().punchRecords];
  }

  private filteredRecords(): PunchRecord[] {
    if (this.recordFilter === 'all') {
      return this.records;
    }
    return this.records.filter((r: PunchRecord) => r.punch_type === this.recordFilter);
  }

  async loadAnalysis(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      const client = AuthStore.getInstance().getHttpClient();
      const wrapper = await client.request<PunchAnalysisWrapper>('GET', API_PUNCH_ANALYSIS, null);
      this.analysis = wrapper.data;
    } catch (e) {
      this.error = (e as Error).message ?? '加载失败';
    } finally {
      this.isLoading = false;
    }
  }

  // Backend returns completion rates as decimals (0..1). Normalize to 0..100.
  private toPercent(rate: number): number {
    if (rate === null || rate === undefined || isNaN(rate)) {
      return 0;
    }
    const value: number = rate <= 1 ? rate * 100 : rate;
    return Math.round(value);
  }

  private dietPercent(): number {
    return this.analysis === null ? 0 : this.toPercent(this.analysis.diet_completion_rate);
  }

  private exercisePercent(): number {
    return this.analysis === null ? 0 : this.toPercent(this.analysis.exercise_completion_rate);
  }

  private overallRate(): number {
    if (this.analysis === null) {
      return 0;
    }
    return Math.round((this.dietPercent() + this.exercisePercent()) / 2);
  }

  @Builder
  MiniRing(percent: number, label: string, color: string) {
    Column() {
      ProgressRing({
        percent: percent,
        ringSize: 72,
        strokeWidth: 7,
        activeColor: color,
        centerValue: Math.round(percent) + '%',
        valueFontSize: TYPO_SUBTITLE.size,
        valueColor: color
      })
      Text(label)
        .fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_500)
        .margin({ top: SPACE_2 })
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  RingHeader() {
    if (this.analysis !== null) {
      Column() {
        ProgressRing({
          percent: this.overallRate(),
          ringSize: 148,
          strokeWidth: 14,
          activeColor: COLOR_ACCENT_SAGE_500,
          centerValue: this.overallRate() + '%',
          centerLabel: '总体完成',
          valueFontSize: TYPO_HEADLINE.size + 8
        })
        .margin({ top: SPACE_2, bottom: SPACE_4 })

        Row() {
          this.MiniRing(this.dietPercent(), '饮食', COLOR_ACCENT_SAGE_500)
          this.MiniRing(this.exercisePercent(), '运动', COLOR_ACCENT_CLAY_500)
          Column() {
            ProgressRing({
              percent: 100,
              ringSize: 72,
              strokeWidth: 7,
              activeColor: COLOR_ACCENT_MIST_500,
              centerValue: this.analysis.total_punches.toString(),
              valueFontSize: TYPO_SUBTITLE.size,
              valueColor: COLOR_ACCENT_MIST_500
            })
            Text('总打卡')
              .fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_500)
              .margin({ top: SPACE_2 })
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Center)
        }
        .width('100%')
        .margin({ top: SPACE_2 })
      }
      .width('100%')
      .backgroundColor(COLOR_PAPER_50)
      .borderRadius(RADIUS_CELL)
      .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
      .padding(SPACE_4)
    }
  }

  @Builder
  TrendChart() {
    if (this.analysis !== null && this.analysis.last_7_days_trend.length > 0) {
      Column() {
        Text('近 7 日趋势')
          .fontSize(TYPO_TITLE.size).fontWeight(TYPO_TITLE.weight)
          .fontColor(COLOR_INK_700).width('100%')

        Row() {
          ForEach(this.analysis.last_7_days_trend, (day: PunchAnalysisTrendDay) => {
            Column() {
              Text(day.date.slice(5))
                .fontSize(9).fontColor(COLOR_INK_400)
              Column() {
                Column()
                  .width(12).height(this.barHeight(day.diet_completed))
                  .backgroundColor(COLOR_ACCENT_SAGE_500)
                  .borderRadius(2)
                Column()
                  .width(12).height(this.barHeight(day.exercise_completed))
                  .backgroundColor(COLOR_ACCENT_CLAY_500)
                  .borderRadius(2)
                  .margin({ top: 2 })
              }
              .alignItems(HorizontalAlign.Center)
              .justifyContent(FlexAlign.End)
              .height(80)
            }
            .layoutWeight(1)
            .alignItems(HorizontalAlign.Center)
          })
        }
        .width('100%').margin({ top: SPACE_2 })

        Row({ space: SPACE_2 }) {
          Row() { Column().width(8).height(8).backgroundColor(COLOR_ACCENT_SAGE_500).borderRadius(2); Text('饮食').fontSize(10).fontColor(COLOR_INK_500).margin({ left: 4 }) }
          Row() { Column().width(8).height(8).backgroundColor(COLOR_ACCENT_CLAY_500).borderRadius(2); Text('运动').fontSize(10).fontColor(COLOR_INK_500).margin({ left: 4 }) }
        }
        .margin({ top: SPACE_1 })
      }
      .width('100%')
      .backgroundColor(COLOR_PAPER_50)
      .borderRadius(RADIUS_CELL)
      .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
      .padding(SPACE_4)
    }
  }

  private barHeight(count: number): number {
    return Math.max(4, count * 20);
  }

  private recordTypeLabel(t: string): string {
    if (t === 'diet') { return '饮食'; }
    if (t === 'exercise') { return '运动'; }
    return '其他';
  }

  private recordTypeColor(t: string): string {
    if (t === 'diet') { return COLOR_ACCENT_SAGE_500; }
    if (t === 'exercise') { return COLOR_ACCENT_CLAY_500; }
    return COLOR_ACCENT_MIST_500;
  }

  @Builder
  FilterChip(label: string, value: string) {
    Text(label)
      .fontSize(TYPO_CAPTION.size)
      .fontColor(this.recordFilter === value ? COLOR_PAPER_50 : COLOR_INK_600)
      .backgroundColor(this.recordFilter === value ? COLOR_ACCENT_SAGE_500 : COLOR_PAPER_100)
      .borderRadius(RADIUS_PILL)
      .padding({ left: SPACE_3, right: SPACE_3, top: SPACE_1, bottom: SPACE_1 })
      .onClick(() => { this.recordFilter = value; })
  }

  @Builder
  RecordsSection() {
    Column() {
      Row() {
        Text('打卡记录')
          .fontSize(TYPO_TITLE.size).fontWeight(TYPO_TITLE.weight).fontColor(COLOR_INK_700)
        Blank()
        Row({ space: SPACE_1 }) {
          this.FilterChip('全部', 'all')
          this.FilterChip('饮食', 'diet')
          this.FilterChip('运动', 'exercise')
        }
      }
      .width('100%')

      if (this.filteredRecords().length === 0) {
        Text('暂无打卡记录')
          .fontSize(TYPO_BODY.size).fontColor(COLOR_INK_400)
          .textAlign(TextAlign.Center).width('100%').margin({ top: SPACE_4 })
      } else {
        ForEach(this.filteredRecords(), (record: PunchRecord) => {
          Row() {
            Column()
              .width(8).height(8).borderRadius(4)
              .backgroundColor(this.recordTypeColor(record.punch_type))
              .margin({ right: SPACE_3 })
            Column() {
              Text(record.plan_title !== null && record.plan_title.length > 0 ? record.plan_title : this.recordTypeLabel(record.punch_type) + '打卡')
                .fontSize(TYPO_BODY.size).fontColor(COLOR_INK_700)
                .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
              if (record.remarks.length > 0) {
                Text(record.remarks)
                  .fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_400)
                  .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).margin({ top: 2 })
              }
            }
            .layoutWeight(1).alignItems(HorizontalAlign.Start)
            Text(record.punch_time.slice(5, 16).replace('T', ' '))
              .fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_400)
          }
          .width('100%')
          .padding({ top: SPACE_3, bottom: SPACE_3 })
          .border({ width: { bottom: STROKE_HAIRLINE.width }, color: STROKE_HAIRLINE.color })
        }, (record: PunchRecord) => record.id.toString())
      }
    }
    .width('100%')
    .backgroundColor(COLOR_PAPER_50)
    .borderRadius(RADIUS_CELL)
    .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
    .padding(SPACE_4)
    .margin({ left: SPACE_4, right: SPACE_4, top: SPACE_3 })
  }

  build() {
    Column() {
      PageHeader({ title: '打卡记录与分析' })

      Scroll() {
        Column() {
          if (this.isLoading) {
          Column() {
            LoadingProgress()
              .width(48).height(48)
              .color(COLOR_ACCENT_SAGE_500)
            Text('正在生成分析报告...')
              .fontSize(TYPO_BODY.size).fontColor(COLOR_INK_600)
              .margin({ top: SPACE_3 })
            Text('数据较多时可能需要几秒钟')
              .fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_400)
              .margin({ top: SPACE_1 })

            Column({ space: SPACE_3 }) {
              SkeletonLoader({ variant: 'card', count: 1 })
              SkeletonLoader({ variant: 'lines', count: 3, lineHeight: SPACE_7 })
            }
            .width('100%').margin({ top: SPACE_7 })
          }
          .width('100%').padding({ left: SPACE_4, right: SPACE_4, top: SPACE_9 })
          .alignItems(HorizontalAlign.Center)
        } else if (this.error !== null) {
          ErrorRetry({ message: this.error, onRetry: () => { this.loadAnalysis(); } })
        } else if (this.analysis !== null) {
          Column({ space: SPACE_3 }) {
            Column() {
              this.RingHeader()
            }.width('100%').padding({ left: SPACE_4, right: SPACE_4 })

            Column() {
              this.TrendChart()
            }.width('100%').padding({ left: SPACE_4, right: SPACE_4 })

            if (this.analysis.adherence_comment.length > 0) {
              Column() {
                Text('依从性评价')
                  .fontSize(TYPO_TITLE.size).fontWeight(TYPO_TITLE.weight)
                  .fontColor(COLOR_INK_700).width('100%')
                Text(this.analysis.adherence_comment)
                  .fontSize(TYPO_BODY.size).fontColor(COLOR_INK_500)
                  .width('100%').margin({ top: SPACE_2 })
              }
              .width('100%')
              .backgroundColor(COLOR_PAPER_50)
              .borderRadius(RADIUS_CELL)
              .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
              .padding(SPACE_4)
            }

            if (this.analysis.improvement_suggestions.length > 0) {
              Column() {
                Text('改善建议')
                  .fontSize(TYPO_TITLE.size).fontWeight(TYPO_TITLE.weight)
                  .fontColor(COLOR_INK_700).width('100%')
                ForEach(this.analysis.improvement_suggestions, (suggestion: string, index: number) => {
                  Row() {
                    Text((index + 1) + '.')
                      .fontSize(TYPO_BODY.size).fontColor(COLOR_ACCENT_SAGE_500)
                      .margin({ right: SPACE_1 })
                    Text(suggestion)
                      .fontSize(TYPO_BODY.size).fontColor(COLOR_INK_500)
                      .layoutWeight(1)
                  }
                  .width('100%').margin({ top: SPACE_2 })
                })
              }
              .width('100%')
              .backgroundColor(COLOR_PAPER_50)
              .borderRadius(RADIUS_CELL)
              .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
              .padding(SPACE_4)
            }
          }
          .width('100%')
          .margin({ top: SPACE_3 })
        }

        if (!this.isLoading && this.error === null) {
          this.RecordsSection()
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
