import { SPACE_2, SPACE_3, SPACE_6, SPACE_7, RADIUS_PILL, COLOR_INK_300, COLOR_INK_500, COLOR_ACCENT_SAGE_500, COLOR_PAPER_50, TYPO_BODY, TYPO_LABEL } from '../common/constants/DesignTokens';
import { Icon } from './Icon';

interface ErrorRetryProps {
  message: string;
  onRetry?: () => void;
  iconName?: string;
  iconSize?: number;
  iconColor?: string;
}

interface ErrorMessagesMap {
  NETWORK: string;
  SERVER: string;
  DATA_LOAD: string;
  SUBMIT: string;
  UNKNOWN: string;
}
export const ERROR_MESSAGES: ErrorMessagesMap = {
  NETWORK: '网络连接失败，请检查网络后重试',
  SERVER: '服务器繁忙，请稍后再试',
  DATA_LOAD: '数据加载失败',
  SUBMIT: '提交失败，请重试',
  UNKNOWN: '未知错误，请稍后重试'
};

@Component
export struct ErrorRetry {
  static readonly DEFAULT_ICON_NAME: string = 'WARNING';
  static readonly DEFAULT_ICON_SIZE: number = SPACE_7;
  static readonly DEFAULT_ICON_COLOR: string = COLOR_INK_300;

  @Prop message: string;
  onRetry?: () => void;
  @Prop iconName: string = ErrorRetry.DEFAULT_ICON_NAME;
  @Prop iconSize: number = ErrorRetry.DEFAULT_ICON_SIZE;
  @Prop iconColor: string = ErrorRetry.DEFAULT_ICON_COLOR;

  build(): void {
    Column({ space: SPACE_3 }) {
      Icon({ name: this.iconName, iconSize: this.iconSize, color: this.iconColor })
      Text(this.message)
        .fontSize(TYPO_BODY.size)
        .fontWeight(TYPO_BODY.weight)
        .fontColor(COLOR_INK_500)
        .textAlign(TextAlign.Center)
        .maxLines(3)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      if (this.onRetry) {
        Button('重试', { type: ButtonType.Capsule })
          .backgroundColor(COLOR_ACCENT_SAGE_500)
          .fontColor(COLOR_PAPER_50)
          .fontSize(TYPO_LABEL.size)
          .fontWeight(TYPO_LABEL.weight)
          .borderRadius(RADIUS_PILL)
          .padding({ left: SPACE_6, right: SPACE_6, top: SPACE_2, bottom: SPACE_2 })
          .onClick(() => { this.onRetry?.() })
      }
    }
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .padding(SPACE_6)
    .width('100%')
    .height('100%')
  }
}
