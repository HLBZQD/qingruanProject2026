import { SPACE_2, SPACE_3, SPACE_4, SPACE_6, RADIUS_PILL, RADIUS_HERO, COLOR_INK_700, COLOR_INK_500, COLOR_INK_300, COLOR_ACCENT_SAGE_500, COLOR_PAPER_50, TYPO_TITLE, TYPO_BODY, TYPO_LABEL } from '../common/constants/DesignTokens';
import { Icon } from './Icon';

interface DisclaimerBarProps {
  onAccept?: () => void;
  onDecline?: () => void;
}

export const DISCLAIMER_TEXT: string =
  '本应用提供的健康建议和生活方案均基于 AI 生成，仅供参考，不构成医疗诊断或处方。' +
  '如有身体不适或需要专业医疗建议，请及时咨询执业医师或前往正规医疗机构。' +
  '使用本应用即表示您理解并同意上述声明。';

@Component
export struct DisclaimerBar {
  onAccept?: () => void;
  onDecline?: () => void;

  build(): void {
    if (this.onAccept !== undefined && this.onDecline !== undefined) {
      Column() {
        Column({ space: SPACE_4 }) {
          Icon({ name: 'INFO', iconSize: 40, color: COLOR_ACCENT_SAGE_500 })
          Text('免责声明')
            .fontSize(TYPO_TITLE.size)
            .fontWeight(TYPO_TITLE.weight)
            .fontColor(COLOR_INK_700)
            .textAlign(TextAlign.Center)
          Text(DISCLAIMER_TEXT)
            .fontSize(TYPO_BODY.size)
            .fontWeight(TYPO_BODY.weight)
            .fontColor(COLOR_INK_500)
            .textAlign(TextAlign.Start)
            .maxLines(10)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .lineHeight(TYPO_BODY.size * 1.6)
          Row({ space: SPACE_3 }) {
            Button('暂不使用', { type: ButtonType.Capsule })
              .backgroundColor(COLOR_PAPER_50)
              .fontColor(COLOR_INK_500)
              .fontSize(TYPO_LABEL.size)
              .fontWeight(TYPO_LABEL.weight)
              .border({ width: 1, color: COLOR_INK_300 })
              .borderRadius(RADIUS_PILL)
              .padding({ left: SPACE_6, right: SPACE_6, top: SPACE_2, bottom: SPACE_2 })
              .layoutWeight(1)
              .onClick(() => { this.onDecline?.() })
            Button('已知晓并同意', { type: ButtonType.Capsule })
              .backgroundColor(COLOR_ACCENT_SAGE_500)
              .fontColor(COLOR_PAPER_50)
              .fontSize(TYPO_LABEL.size)
              .fontWeight(TYPO_LABEL.weight)
              .borderRadius(RADIUS_PILL)
              .padding({ left: SPACE_6, right: SPACE_6, top: SPACE_2, bottom: SPACE_2 })
              .layoutWeight(1)
              .onClick(() => { this.onAccept?.() })
          }
          .width('100%')
        }
        .backgroundColor(COLOR_PAPER_50)
        .borderRadius(RADIUS_HERO)
        .width('85%')
        .padding(SPACE_6)
      }
      .width('100%')
      .height('100%')
      .backgroundColor('rgba(24, 24, 24, 0.4)')
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
    }
  }
}
