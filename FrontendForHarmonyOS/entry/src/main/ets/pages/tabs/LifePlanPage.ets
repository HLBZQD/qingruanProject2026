import { LifePlanStore, LifePlanData } from '../../stores/LifePlanStore';
import { PunchStore } from '../../stores/PunchStore';
import { LifePlan, PlanType, PunchType } from '../../types/models';
import { Icon } from '../../components/Icon';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { ErrorRetry } from '../../components/ErrorRetry';
import { EmptyState } from '../../components/EmptyState';
import { ProgressRing } from '../../components/ProgressRing';
import {
  COLOR_PAPER_50, COLOR_PAPER_100,
  COLOR_ACCENT_SAGE_500, COLOR_ACCENT_SAGE_300, COLOR_ACCENT_CLAY_500, COLOR_ACCENT_MIST_500,
  COLOR_SUCCESS_600, COLOR_DANGER_600,
  COLOR_INK_800, COLOR_INK_700, COLOR_INK_600, COLOR_INK_500, COLOR_INK_400, COLOR_INK_200,
  TYPO_TITLE, TYPO_SUBTITLE, TYPO_BODY, TYPO_LABEL, TYPO_CAPTION,
  RADIUS_CELL, RADIUS_PILL, RADIUS_TAG,
  STROKE_HAIRLINE,
  SPACE_1, SPACE_2, SPACE_3, SPACE_4, SPACE_7, SPACE_9
} from '../../common/constants/DesignTokens';

interface SectionHeaderParams {
  title: string;
  iconName: string;
  iconColor: string;
}

interface SectionCardParams {
  plan: LifePlan;
  accentColor: string;
}

interface CategoryCellParams {
  iconName: string;
  iconColor: string;
  label: string;
  pct: number;
  completed: number;
  total: number;
}

export function mapPlanTypeToPunchType(planType: PlanType): PunchType {
  if (planType === 'other') {
    return 'diet';
  }
  return planType;
}

@Component
export struct LifePlanPage {
  lifePlanStore: LifePlanStore = LifePlanStore.getInstance();
  punchStore: PunchStore = PunchStore.getInstance();
  lifePlanData: LifePlanData = this.lifePlanStore.getLifePlanData();

  @State dietCompleted: number = 0;
  @State exerciseCompleted: number = 0;
  @State otherCompleted: number = 0;
  @State totalCompleted: number = 0;
  @State dietPct: number = 0;
  @State exercisePct: number = 0;
  @State otherPct: number = 0;
  @State totalPct: number = 0;

  @State formAge: string = '';
  @State formGender: 'male' | 'female' | null = null;
  @State formHeight: string = '';
  @State formWeight: string = '';
  @State formDietary: string = '';
  @State formActivity: string = '';
  @State showAdjustPanel: boolean = false;
  @State adjustFeedback: string = '';
  @State planTick: number = 0;

  private dietTotal: number = 0;
  private exerciseTotal: number = 0;
  private otherTotal: number = 0;
  private totalCount: number = 0;

  private planTypeLookup: Map<number, PlanType> = this.buildPlanTypeLookup();

  private buildPlanTypeLookup(): Map<number, PlanType> {
    const map = new Map<number, PlanType>();
    for (const plan of this.lifePlanData.diet_plans) {
      map.set(plan.id, plan.plan_type);
    }
    for (const plan of this.lifePlanData.exercise_plans) {
      map.set(plan.id, plan.plan_type);
    }
    for (const plan of this.lifePlanData.other_plans) {
      map.set(plan.id, plan.plan_type);
    }
    return map;
  }

  aboutToAppear(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    await this.lifePlanStore.loadCurrentPlan();
    this.recomputeTotals();
    await this.punchStore.loadPunchList();
    this.updateProgress();
  }

  private recomputeTotals(): void {
    this.planTypeLookup = this.buildPlanTypeLookup();
    this.dietTotal = this.lifePlanData.diet_plans.length;
    this.exerciseTotal = this.lifePlanData.exercise_plans.length;
    this.otherTotal = this.lifePlanData.other_plans.length;
    this.totalCount = this.dietTotal + this.exerciseTotal + this.otherTotal;
  }

  updateProgress(): void {
    const today = new Date().toISOString().slice(0, 10);
    const punchedSet = new Set<number>();
    for (const record of this.punchStore.getPunchData().punchRecords) {
      if (record.punch_time.slice(0, 10) === today && record.plan_id !== null) {
        punchedSet.add(record.plan_id);
      }
    }
    let d = 0;
    let e = 0;
    let o = 0;
    punchedSet.forEach((planId: number) => {
      const pt = this.planTypeLookup.get(planId);
      if (pt === 'diet') {
        d++;
      } else if (pt === 'exercise') {
        e++;
      } else if (pt === 'other') {
        o++;
      }
    });
    animateTo({ duration: 600, curve: Curve.EaseOut }, () => {
      this.dietCompleted = d;
      this.exerciseCompleted = e;
      this.otherCompleted = o;
      this.totalCompleted = d + e + o;
      this.dietPct = this.dietTotal > 0 ? Math.round(d / this.dietTotal * 100) : 0;
      this.exercisePct = this.exerciseTotal > 0 ? Math.round(e / this.exerciseTotal * 100) : 0;
      this.otherPct = this.otherTotal > 0 ? Math.round(o / this.otherTotal * 100) : 0;
      this.totalPct = this.totalCount > 0 ? Math.round((d + e + o) / this.totalCount * 100) : 0;
    });
  }

  private isPunchedToday(planId: number, punchType: PunchType): boolean {
    return this.punchStore.isTodayPunched(planId, punchType);
  }

  @Builder
  SectionHeader($$: SectionHeaderParams) {
    Row() {
      Icon({ name: $$.iconName, iconSize: 20, color: $$.iconColor })
      Text($$.title)
        .fontSize(TYPO_TITLE.size)
        .fontWeight(TYPO_TITLE.weight)
        .fontColor(COLOR_INK_800)
        .margin({ left: SPACE_2 })
    }
    .width('100%')
    .padding({ left: SPACE_4, right: SPACE_4, top: SPACE_3, bottom: SPACE_2 })
  }

  @Builder
  SectionCard($$: SectionCardParams) {
    Row() {
      Column() {
        Text($$.plan.time_desc)
          .fontSize(TYPO_CAPTION.size)
          .fontWeight(TYPO_CAPTION.weight)
          .fontColor($$.accentColor)
          .backgroundColor(COLOR_PAPER_100)
          .borderRadius(RADIUS_TAG)
          .padding({ left: SPACE_2, right: SPACE_2, top: SPACE_1, bottom: SPACE_1 })
        Text($$.plan.title)
          .fontSize(TYPO_SUBTITLE.size)
          .fontWeight(TYPO_SUBTITLE.weight)
          .fontColor(COLOR_INK_700)
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .margin({ top: SPACE_2 })
        Text($$.plan.content)
          .fontSize(TYPO_BODY.size)
          .fontWeight(TYPO_BODY.weight)
          .fontColor(COLOR_INK_500)
          .maxLines(3)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .margin({ top: SPACE_1 })
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)

      Column() {
        if (this.isPunchedToday($$.plan.id, mapPlanTypeToPunchType($$.plan.plan_type))) {
          Icon({ name: 'CHECK', iconSize: 20, color: COLOR_SUCCESS_600 })
          Text('已完成')
            .fontSize(TYPO_CAPTION.size)
            .fontColor(COLOR_SUCCESS_600)
            .margin({ top: SPACE_1 })
        } else {
          Button('打卡')
            .fontSize(TYPO_LABEL.size)
            .fontWeight(TYPO_LABEL.weight)
            .backgroundColor(COLOR_ACCENT_SAGE_500)
            .fontColor(COLOR_PAPER_50)
            .borderRadius(RADIUS_PILL)
            .onClick(() => {
              this.punchStore.createPunch(
                $$.plan.id,
                mapPlanTypeToPunchType($$.plan.plan_type),
                'completed',
                null
              ).then(() => {
                this.updateProgress();
              });
            })
        }
      }
      .width(60)
      .alignItems(HorizontalAlign.Center)
    }
    .width('100%')
    .backgroundColor(COLOR_PAPER_50)
    .borderRadius(RADIUS_CELL)
    .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
    .padding(SPACE_3)
    .margin({ bottom: SPACE_2 })
  }

  @Builder
  CategoryCell($$: CategoryCellParams) {
    Column() {
      ProgressRing({
        percent: $$.pct,
        ringSize: 72,
        strokeWidth: 7,
        activeColor: $$.completed > 0 ? $$.iconColor : COLOR_INK_200,
        centerValue: $$.completed + '/' + $$.total,
        valueFontSize: TYPO_SUBTITLE.size,
        valueColor: $$.completed > 0 ? $$.iconColor : COLOR_INK_400
      })
      Row() {
        Icon({ name: $$.iconName, iconSize: 14, color: $$.iconColor })
        Text($$.label)
          .fontSize(TYPO_CAPTION.size)
          .fontWeight(TYPO_CAPTION.weight)
          .fontColor(COLOR_INK_500)
          .margin({ left: SPACE_1 })
      }
      .margin({ top: SPACE_2 })
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Center)
    .padding({ left: SPACE_1, right: SPACE_1 })
  }

  @Builder
  ProgressHeader() {
    Column() {
      ProgressRing({
        percent: this.totalPct,
        ringSize: 148,
        strokeWidth: 14,
        activeColor: this.totalCompleted > 0 ? COLOR_ACCENT_SAGE_500 : COLOR_INK_200,
        centerValue: this.totalPct + '%',
        centerLabel: '今日完成 ' + this.totalCompleted + '/' + this.totalCount,
        valueFontSize: TYPO_TITLE.size + 12,
        valueColor: this.totalCompleted > 0 ? COLOR_ACCENT_SAGE_500 : COLOR_INK_400
      })
      .margin({ top: SPACE_2, bottom: SPACE_4 })

      Divider().strokeWidth(0.5).color(STROKE_HAIRLINE.color)

      Row() {
        this.CategoryCell({ iconName: 'FORK_KNIFE', iconColor: COLOR_ACCENT_SAGE_500, label: '饮食', pct: this.dietPct, completed: this.dietCompleted, total: this.dietTotal })
        this.CategoryCell({ iconName: 'RUN', iconColor: COLOR_ACCENT_CLAY_500, label: '运动', pct: this.exercisePct, completed: this.exerciseCompleted, total: this.exerciseTotal })
        this.CategoryCell({ iconName: 'INFO', iconColor: COLOR_ACCENT_MIST_500, label: '其他', pct: this.otherPct, completed: this.otherCompleted, total: this.otherTotal })
      }
      .width('100%')
      .margin({ top: SPACE_4 })
    }
    .width('100%')
    .backgroundColor(COLOR_PAPER_50)
    .borderRadius(RADIUS_CELL)
    .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
    .padding(SPACE_4)
    .margin({ left: SPACE_4, right: SPACE_4, top: SPACE_4 })
  }

  private canGenerate(): boolean {
    const age = parseInt(this.formAge);
    const height = parseInt(this.formHeight);
    const weight = parseInt(this.formWeight);
    return age > 0 && this.formGender !== null && height > 0 && weight > 0
      && this.formDietary.trim().length > 0 && this.formActivity.trim().length > 0;
  }

  private submitGenerate(): void {
    if (!this.canGenerate() || this.formGender === null) {
      return;
    }
    this.lifePlanStore.generatePlan(
      parseInt(this.formAge), this.formGender, parseInt(this.formHeight), parseInt(this.formWeight),
      this.formDietary.trim(), this.formActivity.trim()
    ).then((ok: boolean) => {
      if (ok) {
        this.recomputeTotals();
        this.updateProgress();
      }
    });
  }

  private submitAdjust(): void {
    const fb = this.adjustFeedback.trim();
    if (fb.length === 0) {
      return;
    }
    this.lifePlanStore.adjustPlan(fb).then((ok: boolean) => {
      if (ok) {
        this.showAdjustPanel = false;
        this.adjustFeedback = '';
        this.recomputeTotals();
        this.updateProgress();
      }
    });
  }

  @Builder
  FieldLabel(text: string) {
    Text(text)
      .fontSize(TYPO_LABEL.size).fontColor(COLOR_INK_600)
      .width('100%').margin({ top: SPACE_3, bottom: SPACE_1 })
  }

  @Builder
  GenerateForm() {
    Column() {
      Column() {
        Icon({ name: 'LIFEPLAN', iconSize: 40, color: COLOR_ACCENT_SAGE_500 })
        Text('生成专属生活方案')
          .fontSize(TYPO_TITLE.size).fontWeight(TYPO_TITLE.weight).fontColor(COLOR_INK_800)
          .margin({ top: SPACE_2 })
        Text('填写基本信息，AI 为你定制饮食与运动计划')
          .fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_400)
          .margin({ top: SPACE_1 })
      }
      .width('100%').alignItems(HorizontalAlign.Center).padding({ top: SPACE_4, bottom: SPACE_2 })

      this.FieldLabel('年龄')
      TextInput({ placeholder: '请输入年龄', text: this.formAge })
        .type(InputType.Number).backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_CELL)
        .height(SPACE_9).padding({ left: SPACE_3 })
        .onChange((v: string) => { this.formAge = v; })

      this.FieldLabel('性别')
      Row({ space: SPACE_2 }) {
        Button('男').layoutWeight(1).fontSize(TYPO_BODY.size)
          .backgroundColor(this.formGender === 'male' ? COLOR_ACCENT_SAGE_500 : COLOR_PAPER_100)
          .fontColor(this.formGender === 'male' ? COLOR_PAPER_50 : COLOR_INK_600)
          .borderRadius(RADIUS_PILL).onClick(() => { this.formGender = 'male'; })
        Button('女').layoutWeight(1).fontSize(TYPO_BODY.size)
          .backgroundColor(this.formGender === 'female' ? COLOR_ACCENT_SAGE_500 : COLOR_PAPER_100)
          .fontColor(this.formGender === 'female' ? COLOR_PAPER_50 : COLOR_INK_600)
          .borderRadius(RADIUS_PILL).onClick(() => { this.formGender = 'female'; })
      }.width('100%')

      Row({ space: SPACE_3 }) {
        Column() {
          this.FieldLabel('身高 (cm)')
          TextInput({ placeholder: 'cm', text: this.formHeight })
            .type(InputType.Number).backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_CELL)
            .height(SPACE_9).padding({ left: SPACE_3 })
            .onChange((v: string) => { this.formHeight = v; })
        }.layoutWeight(1)
        Column() {
          this.FieldLabel('体重 (kg)')
          TextInput({ placeholder: 'kg', text: this.formWeight })
            .type(InputType.Number).backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_CELL)
            .height(SPACE_9).padding({ left: SPACE_3 })
            .onChange((v: string) => { this.formWeight = v; })
        }.layoutWeight(1)
      }.width('100%')

      this.FieldLabel('饮食偏好')
      TextInput({ placeholder: '如：清淡少油、不吃辣、偏好蔬菜', text: this.formDietary })
        .backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_CELL)
        .height(SPACE_9).padding({ left: SPACE_3 })
        .onChange((v: string) => { this.formDietary = v; })

      this.FieldLabel('运动偏好')
      TextInput({ placeholder: '如：喜欢散步、每周3次、膝盖不好', text: this.formActivity })
        .backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_CELL)
        .height(SPACE_9).padding({ left: SPACE_3 })
        .onChange((v: string) => { this.formActivity = v; })

      if (this.lifePlanData.errorMessage !== null) {
        Text(this.lifePlanData.errorMessage)
          .fontSize(TYPO_CAPTION.size).fontColor(COLOR_DANGER_600)
          .width('100%').margin({ top: SPACE_3 })
      }

      Button('生成方案')
        .width('100%').height(SPACE_9).margin({ top: SPACE_4 })
        .fontSize(TYPO_BODY.size).fontColor(COLOR_PAPER_50)
        .backgroundColor(COLOR_ACCENT_SAGE_500).borderRadius(RADIUS_PILL)
        .enabled(this.canGenerate())
        .opacity(this.canGenerate() ? 1 : 0.5)
        .onClick(() => { this.submitGenerate(); })
    }
    .width('100%')
    .backgroundColor(COLOR_PAPER_50)
    .borderRadius(RADIUS_CELL)
    .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
    .padding(SPACE_4)
    .margin({ left: SPACE_4, right: SPACE_4, top: SPACE_4 })
  }

  @Builder
  GeneratingState() {
    Column() {
      LoadingProgress().width(56).height(56).color(COLOR_ACCENT_SAGE_500)
      Text('AI 正在定制你的专属方案')
        .fontSize(TYPO_SUBTITLE.size).fontWeight(TYPO_SUBTITLE.weight).fontColor(COLOR_INK_700)
        .margin({ top: SPACE_4 })
      Text('结合你的健康信息与偏好，请稍候…')
        .fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_400)
        .margin({ top: SPACE_1 })
    }
    .width('100%').height(320)
    .justifyContent(FlexAlign.Center).alignItems(HorizontalAlign.Center)
  }

  @Builder
  AdjustPanel() {
    Column() {
      if (!this.showAdjustPanel) {
        Button('调整方案')
          .width('100%').height(SPACE_9)
          .fontSize(TYPO_BODY.size).fontColor(COLOR_ACCENT_SAGE_500)
          .backgroundColor(COLOR_PAPER_50).borderRadius(RADIUS_PILL)
          .border({ width: STROKE_HAIRLINE.width, color: COLOR_ACCENT_SAGE_300 })
          .onClick(() => { this.showAdjustPanel = true; })
      } else {
        Column() {
          Text('调整方案')
            .fontSize(TYPO_SUBTITLE.size).fontWeight(TYPO_SUBTITLE.weight).fontColor(COLOR_INK_700)
            .width('100%')
          TextArea({ placeholder: '描述你希望的调整，如：减少晚餐碳水，增加周末运动强度', text: this.adjustFeedback })
            .backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_CELL)
            .height(88).margin({ top: SPACE_2 })
            .onChange((v: string) => { this.adjustFeedback = v; })
          Row({ space: SPACE_3 }) {
            Button('取消').layoutWeight(1).fontSize(TYPO_BODY.size)
              .backgroundColor(COLOR_PAPER_100).fontColor(COLOR_INK_600).borderRadius(RADIUS_PILL)
              .onClick(() => { this.showAdjustPanel = false; this.adjustFeedback = ''; })
            Button('提交调整').layoutWeight(1).fontSize(TYPO_BODY.size)
              .backgroundColor(COLOR_ACCENT_SAGE_500).fontColor(COLOR_PAPER_50).borderRadius(RADIUS_PILL)
              .enabled(this.adjustFeedback.trim().length > 0)
              .opacity(this.adjustFeedback.trim().length > 0 ? 1 : 0.5)
              .onClick(() => { this.submitAdjust(); })
          }.width('100%').margin({ top: SPACE_3 })
        }
        .width('100%')
        .backgroundColor(COLOR_PAPER_50).borderRadius(RADIUS_CELL)
        .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
        .padding(SPACE_4)
      }
    }
    .width('100%')
    .padding({ left: SPACE_4, right: SPACE_4, top: SPACE_3 })
  }

  build() {
    Scroll() {
      Column() {
        if (this.lifePlanData.isGenerating) {
          this.GeneratingState()
        } else if (this.lifePlanData.isLoading && !this.lifePlanData.loaded) {
          SkeletonLoader({ variant: 'card', count: 3 })
        } else if (this.lifePlanData.errorMessage !== null && !this.lifePlanStore.hasPlan()) {
          ErrorRetry({
            message: this.lifePlanData.errorMessage,
            onRetry: () => { this.loadData() }
          })
        } else if (!this.lifePlanStore.hasPlan()) {
          this.GenerateForm()
        } else {
          this.ProgressHeader()

          if (this.lifePlanData.diet_plans.length > 0) {
            Column() {
              this.SectionHeader({ title: '饮食方案', iconName: 'FORK_KNIFE', iconColor: COLOR_ACCENT_SAGE_500 })
              ForEach(this.lifePlanData.diet_plans, (plan: LifePlan) => {
                this.SectionCard({ plan: plan, accentColor: COLOR_ACCENT_SAGE_500 })
              }, (plan: LifePlan) => plan.id.toString())
            }
          }

          if (this.lifePlanData.exercise_plans.length > 0) {
            Column() {
              this.SectionHeader({ title: '运动方案', iconName: 'RUN', iconColor: COLOR_ACCENT_CLAY_500 })
              ForEach(this.lifePlanData.exercise_plans, (plan: LifePlan) => {
                this.SectionCard({ plan: plan, accentColor: COLOR_ACCENT_CLAY_500 })
              }, (plan: LifePlan) => plan.id.toString())
            }
          }

          if (this.lifePlanData.other_plans.length > 0) {
            Column() {
              this.SectionHeader({ title: '其他建议', iconName: 'INFO', iconColor: COLOR_ACCENT_MIST_500 })
              ForEach(this.lifePlanData.other_plans, (plan: LifePlan) => {
                this.SectionCard({ plan: plan, accentColor: COLOR_ACCENT_MIST_500 })
              }, (plan: LifePlan) => plan.id.toString())
            }
          }

          this.AdjustPanel()

          Blank().height(SPACE_9 + SPACE_7)
        }
      }
    }
    .scrollable(ScrollDirection.Vertical)
    .scrollBar(BarState.Off)
    .backgroundColor(COLOR_PAPER_100)
    .height('100%')
  }
}
