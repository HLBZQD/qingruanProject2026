import { SPACE_2, SPACE_3, SPACE_6, RADIUS_PILL, COLOR_INK_300, COLOR_INK_400, COLOR_INK_600, COLOR_ACCENT_SAGE_300, COLOR_ACCENT_SAGE_500, COLOR_PAPER_50, TYPO_TITLE, TYPO_BODY, TYPO_LABEL } from '../common/constants/DesignTokens';
import { Icon } from './Icon';

interface EmptyStateProps {
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  iconName?: string;
  iconSize?: number;
  iconColor?: string;
}

interface EmptyMessagesMap {
  NO_DATA: string;
  NO_ARTICLES: string;
  NO_PLANS: string;
  NO_PUNCH: string;
  NO_HISTORY: string;
  NO_DOCTOR: string;
}
export const EMPTY_MESSAGES: EmptyMessagesMap = {
  NO_DATA: '暂无数据',
  NO_ARTICLES: '暂无相关资讯',
  NO_PLANS: '暂无生活方案',
  NO_PUNCH: '暂无打卡记录',
  NO_HISTORY: '暂无历史记录',
  NO_DOCTOR: '暂无可咨询医师'
};

@Component
export struct EmptyState {
  static readonly DEFAULT_ICON_NAME: string = 'INFO';
  static readonly DEFAULT_ICON_SIZE: number = 48;
  static readonly DEFAULT_ICON_COLOR: string = COLOR_INK_300;

  @Prop title: string;
  @Prop description: string;
  @Prop actionText: string = '';
  onAction?: () => void;
  @Prop iconName: string = EmptyState.DEFAULT_ICON_NAME;
  @Prop iconSize: number = EmptyState.DEFAULT_ICON_SIZE;
  @Prop iconColor: string = EmptyState.DEFAULT_ICON_COLOR;

  build(): void {
    Column({ space: SPACE_3 }) {
      Icon({ name: this.iconName, iconSize: this.iconSize, color: this.iconColor })
      Text(this.title)
        .fontSize(TYPO_TITLE.size)
        .fontWeight(TYPO_TITLE.weight)
        .fontColor(COLOR_INK_600)
        .textAlign(TextAlign.Center)
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      Text(this.description)
        .fontSize(TYPO_BODY.size)
        .fontWeight(TYPO_BODY.weight)
        .fontColor(COLOR_INK_400)
        .textAlign(TextAlign.Center)
        .maxLines(3)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      if (this.onAction && this.actionText) {
        Button(this.actionText, { type: ButtonType.Capsule })
          .backgroundColor(COLOR_PAPER_50)
          .fontColor(COLOR_ACCENT_SAGE_500)
          .fontSize(TYPO_LABEL.size)
          .fontWeight(TYPO_LABEL.weight)
          .border({ width: 1, color: COLOR_ACCENT_SAGE_300 })
          .borderRadius(RADIUS_PILL)
          .padding({ left: SPACE_6, right: SPACE_6, top: SPACE_2, bottom: SPACE_2 })
          .onClick(() => { this.onAction?.() })
      }
    }
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .padding(SPACE_6)
    .width('100%')
    .height('100%')
  }
}
