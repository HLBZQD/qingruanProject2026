import {
  COLOR_INK_200,
  COLOR_INK_400,
  COLOR_INK_700,
  COLOR_ACCENT_SAGE_500,
  TYPO_CAPTION
} from '../common/constants/DesignTokens';

// A circular ring progress indicator with a centered value + label.
// Reusable across punch analytics, plan progress, etc.
@Component
export struct ProgressRing {
  @Prop percent: number = 0;
  @Prop ringSize: number = 120;
  @Prop strokeWidth: number = 12;
  @Prop activeColor: string = COLOR_ACCENT_SAGE_500;
  @Prop trackColor: string = COLOR_INK_200;
  @Prop centerValue: string = '';
  @Prop centerLabel: string = '';
  @Prop valueFontSize: number = 28;
  @Prop valueColor: string = COLOR_INK_700;
  @Prop labelColor: string = COLOR_INK_400;

  private clampedTarget(): number {
    if (this.percent < 0 || isNaN(this.percent)) {
      return 0;
    }
    if (this.percent > 100) {
      return 100;
    }
    return this.percent;
  }

  build(): void {
    Stack() {
      Progress({ value: this.clampedTarget(), total: 100, type: ProgressType.Ring })
        .width(this.ringSize)
        .height(this.ringSize)
        .color(this.activeColor)
        .style({ strokeWidth: this.strokeWidth, scaleCount: 0, enableSmoothEffect: true })

      Column() {
        if (this.centerValue.length > 0) {
          Text(this.centerValue)
            .fontSize(this.valueFontSize)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.valueColor)
        }
        if (this.centerLabel.length > 0) {
          Text(this.centerLabel)
            .fontSize(TYPO_CAPTION.size)
            .fontColor(this.labelColor)
            .margin({ top: 2 })
        }
      }
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
    }
    .width(this.ringSize)
    .height(this.ringSize)
  }
}
