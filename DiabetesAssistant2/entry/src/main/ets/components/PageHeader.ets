import { router } from '@kit.ArkUI';
import { Icon } from './Icon';
import {
  COLOR_PAPER_100,
  COLOR_INK_700,
  COLOR_INK_500,
  TYPO_TITLE,
  STROKE_HAIRLINE,
  SPACE_2,
  SPACE_4,
  SPACE_9
} from '../common/constants/DesignTokens';

@Component
export struct PageHeader {
  @Prop title: string;
  @Prop showBack: boolean = true;
  onBack?: () => void;
  @BuilderParam trailing?: () => void;

  private handleBack(): void {
    if (this.onBack !== undefined) {
      this.onBack();
    } else {
      router.back();
    }
  }

  build(): void {
    Row() {
      if (this.showBack) {
        Column() {
          Icon({ name: 'BACK', iconSize: 22, color: COLOR_INK_500 })
        }
        .width(SPACE_9)
        .height(SPACE_9)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .onClick(() => { this.handleBack(); })
      } else {
        Row().width(SPACE_9).height(SPACE_9)
      }

      Text(this.title)
        .fontSize(TYPO_TITLE.size)
        .fontWeight(TYPO_TITLE.weight)
        .fontColor(COLOR_INK_700)
        .textAlign(TextAlign.Center)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .layoutWeight(1)

      Column() {
        if (this.trailing !== undefined) {
          this.trailing()
        }
      }
      .width(SPACE_9)
      .height(SPACE_9)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
    }
    .width('100%')
    .height(SPACE_9)
    .padding({ left: SPACE_2, right: SPACE_2 })
    .backgroundColor(COLOR_PAPER_100)
    .border({ width: { bottom: STROKE_HAIRLINE.width }, color: STROKE_HAIRLINE.color })
  }
}
