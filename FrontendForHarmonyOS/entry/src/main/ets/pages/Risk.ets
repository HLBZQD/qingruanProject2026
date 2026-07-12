import { router } from '@kit.ArkUI';
import { RiskFormStore, RiskFormBackup } from '../stores/RiskFormStore';
import { AuthStore } from '../stores/AuthStore';
import { PreferencesManager } from '../common/persistence/PreferencesManager';
import { RiskPredictResponse, RiskHistoryItem } from '../types/api';
import { PageHeader } from '../components/PageHeader';
import { MarkdownViewer } from '../components/MarkdownViewer';
import {
  COLOR_PAPER_50, COLOR_PAPER_100,
  COLOR_ACCENT_SAGE_500, COLOR_ACCENT_CLAY_500,
  COLOR_SUCCESS_600, COLOR_DANGER_600,
  COLOR_INK_700, COLOR_INK_600, COLOR_INK_500, COLOR_INK_400, COLOR_INK_200,
  TYPO_DISPLAY_M, TYPO_HEADLINE, TYPO_TITLE, TYPO_SUBTITLE, TYPO_BODY, TYPO_LABEL, TYPO_CAPTION,
  RADIUS_CELL, RADIUS_PILL,
  STROKE_HAIRLINE,
  SPACE_1, SPACE_2, SPACE_3, SPACE_4, SPACE_7, SPACE_9
} from '../common/constants/DesignTokens';

const HISTORY_OPTIONS: string[] = ['healthy', 'prediabetes', 'diagnosed'];
const HISTORY_LABELS: Record<string, string> = { 'healthy': '健康', 'prediabetes': '糖尿病前期', 'diagnosed': '已确诊' };
const DIABETES_TYPE_OPTIONS: string[] = ['type1', 'type2', 'gestational', 'other'];
const DIABETES_TYPE_LABELS: Record<string, string> = { 'type1': '1型', 'type2': '2型', 'gestational': '妊娠期', 'other': '其他' };
const STEP_LABELS: string[] = ['健康史', '身体数据', '风险因素', '结果'];

@Entry
@Component
struct RiskPage {
  private store: RiskFormStore | null = null;
  @State step: number = 0;
  @State isSubmitting: boolean = false;
  @State submitResult: RiskPredictResponse | null = null;
  @State history: RiskHistoryItem[] = [];
  @State errorMessage: string | null = null;
  @State ready: boolean = false;

  aboutToAppear(): void {
    let pm = PreferencesManager.getInstance();
    if (pm !== null) {
      this.store = RiskFormStore.getInstance(AuthStore.getInstance(), pm);
      let fd = this.store.getFormData();
      fd.isSubmitting = false;
      this.step = fd.currentStep;
      this.submitResult = fd.submitResult;
      this.history = fd.history;
      this.isSubmitting = false;
      this.errorMessage = fd.errorMessage;
      this.store.loadHistory().then(() => {
        if (this.store !== null) {
          this.history = this.store.getFormData().history;
        }
      });
      this.ready = true;
    }
  }

  @Builder
  StepIndicator() {
    Row() {
      ForEach(STEP_LABELS, (label: string, index: number) => {
        Column() {
          Text((index + 1).toString())
            .fontSize(12).fontWeight(FontWeight.Bold)
            .fontColor(index <= this.step ? COLOR_PAPER_50 : COLOR_INK_400)
            .backgroundColor(index <= this.step ? COLOR_ACCENT_SAGE_500 : COLOR_INK_200)
            .width(24).height(24).borderRadius(12).textAlign(TextAlign.Center)
          Text(label).fontSize(10)
            .fontColor(index <= this.step ? COLOR_ACCENT_SAGE_500 : COLOR_INK_400)
            .margin({ top: SPACE_1 })
        }.layoutWeight(1).alignItems(HorizontalAlign.Center)
      }, (label: string) => label)
    }.width('100%').padding({ left: SPACE_4, right: SPACE_4, top: SPACE_3 })
  }

  @Builder
  Step0Basic() {
    Column({ space: SPACE_3 }) {
      Text('糖尿病史').fontSize(TYPO_LABEL.size).fontColor(COLOR_INK_600).width('100%')
      Row({ space: SPACE_2 }) {
        ForEach(HISTORY_OPTIONS, (val: string) => {
          Button(HISTORY_LABELS[val]).fontSize(TYPO_BODY.size)
            .backgroundColor(this.store!.getFormData().diabetes_history === val ? COLOR_ACCENT_SAGE_500 : COLOR_PAPER_100)
            .fontColor(this.store!.getFormData().diabetes_history === val ? COLOR_PAPER_50 : COLOR_INK_500)
            .borderRadius(RADIUS_PILL)
            .onClick(() => { this.store!.getFormData().diabetes_history = val as 'healthy' | 'prediabetes' | 'diagnosed'; })
        }, (val: string) => val)
      }
      if (this.store!.getFormData().diabetes_history === 'diagnosed') {
        Text('糖尿病类型').fontSize(TYPO_LABEL.size).fontColor(COLOR_INK_600).width('100%').margin({ top: SPACE_2 })
        Row({ space: SPACE_2 }) {
          ForEach(DIABETES_TYPE_OPTIONS, (val: string) => {
            Button(DIABETES_TYPE_LABELS[val]).fontSize(TYPO_BODY.size)
              .layoutWeight(1)
              .backgroundColor(this.store!.getFormData().diabetes_type === val ? COLOR_ACCENT_SAGE_500 : COLOR_PAPER_100)
              .fontColor(this.store!.getFormData().diabetes_type === val ? COLOR_PAPER_50 : COLOR_INK_500)
              .borderRadius(RADIUS_PILL)
              .onClick(() => { this.store!.getFormData().diabetes_type = val as 'type1' | 'type2' | 'gestational' | 'other'; })
          }, (val: string) => val)
        }
      }
      Text('年龄').fontSize(TYPO_LABEL.size).fontColor(COLOR_INK_600).width('100%').margin({ top: SPACE_2 })
      TextInput({ placeholder: '请输入年龄', text: this.store!.getFormData().age > 0 ? this.store!.getFormData().age.toString() : '' })
        .type(InputType.Number).fontSize(TYPO_BODY.size)
        .backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_CELL).height(SPACE_9).padding({ left: SPACE_3 })
        .onChange((v: string) => { this.store!.getFormData().age = parseInt(v) || 0; })
      Text('性别').fontSize(TYPO_LABEL.size).fontColor(COLOR_INK_600).width('100%').margin({ top: SPACE_2 })
      Row({ space: SPACE_2 }) {
        Button('男').fontSize(TYPO_BODY.size)
          .backgroundColor(this.store!.getFormData().gender === 'male' ? COLOR_ACCENT_SAGE_500 : COLOR_PAPER_100)
          .fontColor(this.store!.getFormData().gender === 'male' ? COLOR_PAPER_50 : COLOR_INK_500)
          .borderRadius(RADIUS_PILL).onClick(() => { this.store!.getFormData().gender = 'male'; })
        Button('女').fontSize(TYPO_BODY.size)
          .backgroundColor(this.store!.getFormData().gender === 'female' ? COLOR_ACCENT_SAGE_500 : COLOR_PAPER_100)
          .fontColor(this.store!.getFormData().gender === 'female' ? COLOR_PAPER_50 : COLOR_INK_500)
          .borderRadius(RADIUS_PILL).onClick(() => { this.store!.getFormData().gender = 'female'; })
      }
    }.width('100%').padding(SPACE_4)
  }

  @Builder
  Step1Body() {
    Column({ space: SPACE_3 }) {
      Text('身高 (cm)').fontSize(TYPO_LABEL.size).fontColor(COLOR_INK_600).width('100%')
      TextInput({ placeholder: '请输入身高', text: this.store!.getFormData().height > 0 ? this.store!.getFormData().height.toString() : '' })
        .type(InputType.Number).fontSize(TYPO_BODY.size)
        .backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_CELL).height(SPACE_9).padding({ left: SPACE_3 })
        .onChange((v: string) => { this.store!.getFormData().height = parseInt(v) || 0; })
      Text('体重 (kg)').fontSize(TYPO_LABEL.size).fontColor(COLOR_INK_600).width('100%')
      TextInput({ placeholder: '请输入体重', text: this.store!.getFormData().weight > 0 ? this.store!.getFormData().weight.toString() : '' })
        .type(InputType.Number).fontSize(TYPO_BODY.size)
        .backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_CELL).height(SPACE_9).padding({ left: SPACE_3 })
        .onChange((v: string) => { this.store!.getFormData().weight = parseInt(v) || 0; })
      Text('腰围 (cm, 选填)').fontSize(TYPO_LABEL.size).fontColor(COLOR_INK_600).width('100%')
      TextInput({ placeholder: '请输入腰围', text: this.store!.getFormData().waist ? this.store!.getFormData().waist!.toString() : '' })
        .type(InputType.Number).fontSize(TYPO_BODY.size)
        .backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_CELL).height(SPACE_9).padding({ left: SPACE_3 })
        .onChange((v: string) => { this.store!.getFormData().waist = parseInt(v) || null; })
      Text('收缩压 (mmHg, 选填)').fontSize(TYPO_LABEL.size).fontColor(COLOR_INK_600).width('100%')
      TextInput({ placeholder: '请输入收缩压', text: this.store!.getFormData().systolic_bp ? this.store!.getFormData().systolic_bp!.toString() : '' })
        .type(InputType.Number).fontSize(TYPO_BODY.size)
        .backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_CELL).height(SPACE_9).padding({ left: SPACE_3 })
        .onChange((v: string) => { this.store!.getFormData().systolic_bp = parseInt(v) || null; })
    }.width('100%').padding(SPACE_4)
  }

  @Builder
  Step2Risk() {
    Column({ space: SPACE_3 }) {
      Text('家族糖尿病史').fontSize(TYPO_LABEL.size).fontColor(COLOR_INK_600).width('100%')
      Row({ space: SPACE_2 }) {
        Button('有').fontSize(TYPO_BODY.size)
          .backgroundColor(this.store!.getFormData().family_history === 'yes' ? COLOR_ACCENT_SAGE_500 : COLOR_PAPER_100)
          .fontColor(this.store!.getFormData().family_history === 'yes' ? COLOR_PAPER_50 : COLOR_INK_500)
          .borderRadius(RADIUS_PILL).onClick(() => { this.store!.getFormData().family_history = 'yes'; })
        Button('无').fontSize(TYPO_BODY.size)
          .backgroundColor(this.store!.getFormData().family_history === 'no' ? COLOR_ACCENT_SAGE_500 : COLOR_PAPER_100)
          .fontColor(this.store!.getFormData().family_history === 'no' ? COLOR_PAPER_50 : COLOR_INK_500)
          .borderRadius(RADIUS_PILL).onClick(() => { this.store!.getFormData().family_history = 'no'; })
      }
      if (this.store!.getFormData().gender === 'female') {
        Text('是否怀孕').fontSize(TYPO_LABEL.size).fontColor(COLOR_INK_600).width('100%').margin({ top: SPACE_2 })
        Row({ space: SPACE_2 }) {
          Button('是').fontSize(TYPO_BODY.size)
            .backgroundColor(this.store!.getFormData().pregnancy === true ? COLOR_ACCENT_SAGE_500 : COLOR_PAPER_100)
            .fontColor(this.store!.getFormData().pregnancy === true ? COLOR_PAPER_50 : COLOR_INK_500)
            .borderRadius(RADIUS_PILL).onClick(() => { this.store!.getFormData().pregnancy = true; })
          Button('否').fontSize(TYPO_BODY.size)
            .backgroundColor(this.store!.getFormData().pregnancy === false ? COLOR_ACCENT_SAGE_500 : COLOR_PAPER_100)
            .fontColor(this.store!.getFormData().pregnancy === false ? COLOR_PAPER_50 : COLOR_INK_500)
            .borderRadius(RADIUS_PILL).onClick(() => { this.store!.getFormData().pregnancy = false; })
        }
      }
    }.width('100%').padding(SPACE_4)
  }

  @Builder
  Step3Result() {
    Column({ space: SPACE_4 }) {
      if (this.submitResult !== null) {
        Column() {
          Text(this.submitResult.risk_level_label.length > 0 ? this.submitResult.risk_level_label : this.riskLabel(this.submitResult.risk_level))
            .fontSize(TYPO_DISPLAY_M.size).fontWeight(TYPO_DISPLAY_M.weight)
            .fontColor(this.riskColor(this.submitResult.risk_level)).textAlign(TextAlign.Center)
          Text('风险评分 ' + this.submitResult.risk_score + ' 分')
            .fontSize(TYPO_SUBTITLE.size).fontColor(COLOR_INK_600).margin({ top: SPACE_2 })
          Row() {
            Text('匹配类型')
              .fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_400)
            Text(this.submitResult.matched_diabetes_type)
              .fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_600).margin({ left: SPACE_2 })
          }
          .backgroundColor(COLOR_PAPER_100).borderRadius(RADIUS_PILL)
          .padding({ left: SPACE_3, right: SPACE_3, top: SPACE_1, bottom: SPACE_1 })
          .margin({ top: SPACE_3 })
        }.width('100%').backgroundColor(COLOR_PAPER_50).borderRadius(RADIUS_CELL)
        .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color }).padding(SPACE_7)
        if (this.submitResult.advice.length > 0) {
          Column() {
            Text('健康建议').fontSize(TYPO_TITLE.size).fontWeight(TYPO_TITLE.weight).fontColor(COLOR_INK_700).width('100%')
            MarkdownViewer({ markdown: this.submitResult.advice })
          }.width('100%').backgroundColor(COLOR_PAPER_50).borderRadius(RADIUS_CELL)
          .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color }).padding(SPACE_4)
        }
      } else if (this.isSubmitting) {
        Column() {
          LoadingProgress().width(48).height(48).color(COLOR_ACCENT_SAGE_500)
          Text('正在评估您的健康风险...')
            .fontSize(TYPO_BODY.size).fontColor(COLOR_INK_600).margin({ top: SPACE_3 })
        }
        .width('100%').padding(SPACE_9).justifyContent(FlexAlign.Center).alignItems(HorizontalAlign.Center)
      }
    }.width('100%').padding(SPACE_4)
  }

  @Builder
  HistorySection() {
    if (this.history.length > 0) {
      Column() {
        Text('历史记录').fontSize(TYPO_TITLE.size).fontWeight(TYPO_TITLE.weight).fontColor(COLOR_INK_700).width('100%')
        ForEach(this.history.slice(0, 5), (item: RiskHistoryItem) => {
          Row() {
            Column() {
              Text(item.created_at.slice(0, 10)).fontSize(TYPO_CAPTION.size).fontColor(COLOR_INK_400)
              Text(this.riskLabel(item.risk_level)).fontSize(TYPO_BODY.size).fontColor(this.riskColor(item.risk_level)).margin({ top: SPACE_1 })
            }
            Blank()
            Text(item.risk_score + '%').fontSize(TYPO_SUBTITLE.size).fontColor(COLOR_INK_700)
          }.width('100%').padding({ top: SPACE_2, bottom: SPACE_2 })
          .border({ width: { bottom: STROKE_HAIRLINE.width }, color: STROKE_HAIRLINE.color })
        }, (item: RiskHistoryItem) => item.id.toString())
      }.width('100%').padding(SPACE_4)
    }
  }

  private riskLabel(level: string): string {
    if (level === 'high') { return '高风险'; }
    if (level === 'medium') { return '中风险'; }
    return '低风险';
  }

  private riskColor(level: string): string {
    if (level === 'high') { return COLOR_DANGER_600; }
    if (level === 'medium') { return COLOR_ACCENT_CLAY_500; }
    return COLOR_SUCCESS_600;
  }

  private saveCurrentStep(): void {
    if (this.store === null) { return; }
    let fd = this.store.getFormData();
    let backup: RiskFormBackup = {
      diabetes_history: fd.diabetes_history, diabetes_type: fd.diabetes_type,
      age: fd.age, gender: fd.gender, height: fd.height, weight: fd.weight,
      waist: fd.waist, systolic_bp: fd.systolic_bp,
      family_history: fd.family_history, pregnancy: fd.pregnancy,
      currentStep: this.step
    };
    this.store.saveStep(this.step, backup);
  }

  build() {
    if (!this.ready) {
      Column() {
        Text('加载中...').fontSize(TYPO_BODY.size).fontColor(COLOR_INK_400)
      }.width('100%').height('100%').justifyContent(FlexAlign.Center).alignItems(HorizontalAlign.Center)
      .backgroundColor(COLOR_PAPER_100)
    } else {
      Column() {
        PageHeader({ title: '风险预测' })

        Scroll() {
          Column() {
            this.StepIndicator()

          if (this.step === 0) { this.Step0Basic() }
          else if (this.step === 1) { this.Step1Body() }
          else if (this.step === 2) { this.Step2Risk() }
          else { this.Step3Result(); this.HistorySection() }

          if (this.errorMessage !== null) {
            Text(this.errorMessage).fontSize(TYPO_CAPTION.size).fontColor(COLOR_DANGER_600).padding(SPACE_2).margin({ top: SPACE_2 })
          }

          if (this.step < 3 && this.store !== null) {
            Row({ space: SPACE_3 }) {
              if (this.step > 0) {
                Button('上一步').fontSize(TYPO_BODY.size).backgroundColor(COLOR_PAPER_100).fontColor(COLOR_INK_600)
                  .borderRadius(RADIUS_PILL).height(SPACE_9).layoutWeight(1)
                  .onClick(() => { this.step--; this.saveCurrentStep(); })
              }
              if (this.step < 2) {
                Button('下一步').fontSize(TYPO_BODY.size).backgroundColor(COLOR_ACCENT_SAGE_500).fontColor(COLOR_PAPER_50)
                  .borderRadius(RADIUS_PILL).height(SPACE_9).layoutWeight(1)
                  .onClick(() => { this.step++; this.saveCurrentStep(); })
              }
              if (this.step === 2 && this.store !== null) {
                Button() {
                  Row() {
                    if (this.isSubmitting) {
                      LoadingProgress().width(20).height(20).color(COLOR_PAPER_50)
                      Text('评估中...').fontSize(TYPO_BODY.size).fontColor(COLOR_PAPER_50).margin({ left: SPACE_2 })
                    } else {
                      Text('提交评估').fontSize(TYPO_BODY.size).fontColor(COLOR_PAPER_50)
                    }
                  }
                  .justifyContent(FlexAlign.Center)
                }
                .backgroundColor(COLOR_ACCENT_SAGE_500)
                .borderRadius(RADIUS_PILL).height(SPACE_9).layoutWeight(1).enabled(!this.isSubmitting)
                .onClick(() => {
                  this.saveCurrentStep();
                  this.isSubmitting = true;
                  let s = this.store!;
                  s.submit().then(() => {
                    let fd = s.getFormData();
                    this.submitResult = fd.submitResult;
                    this.errorMessage = fd.errorMessage;
                    this.isSubmitting = fd.isSubmitting;
                    if (fd.submitResult !== null) { this.step = 3; }
                  });
                })
              }
            }.width('100%').padding(SPACE_4)
          }

          if (this.step === 3) {
            Column({ space: SPACE_3 }) {
              Button('生成生活方案').fontSize(TYPO_BODY.size).backgroundColor(COLOR_ACCENT_SAGE_500).fontColor(COLOR_PAPER_50)
                .borderRadius(RADIUS_PILL).height(SPACE_9).width('100%')
                .onClick(() => {
                  AppStorage.setOrCreate('MAIN_TAB_INDEX', 2);
                  router.back();
                })
              Button('重新评估').fontSize(TYPO_BODY.size).backgroundColor(COLOR_PAPER_100).fontColor(COLOR_INK_600)
                .borderRadius(RADIUS_PILL).height(SPACE_9).width('100%')
                .onClick(() => { this.step = 0; this.submitResult = null; })
            }
            .margin({ left: SPACE_4, right: SPACE_4 })
          }

          Blank().height(SPACE_9)
          }
        }.scrollable(ScrollDirection.Vertical).scrollBar(BarState.Off)
        .layoutWeight(1)
      }
      .backgroundColor(COLOR_PAPER_100).width('100%').height('100%')
    }
  }

  pageTransition(): void {
    PageTransitionEnter({ duration: 300, curve: Curve.EaseOut }).slide(SlideEffect.Right).opacity(0)
    PageTransitionExit({ duration: 250, curve: Curve.EaseIn }).slide(SlideEffect.Right).opacity(0)
  }
}
