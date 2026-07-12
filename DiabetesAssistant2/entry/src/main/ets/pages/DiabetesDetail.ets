import { router } from '@kit.ArkUI';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import {
  COLOR_PAPER_50, COLOR_PAPER_100,
  COLOR_ACCENT_SAGE_500, COLOR_ACCENT_CLAY_500, COLOR_ACCENT_MIST_500,
  COLOR_INK_700, COLOR_INK_500,
  TYPO_HEADLINE, TYPO_TITLE, TYPO_BODY,
  RADIUS_CELL,
  STROKE_HAIRLINE,
  SPACE_2, SPACE_3, SPACE_4, SPACE_9
} from '../common/constants/DesignTokens';

interface DetailParams {
  name: string;
  patho: string;
  manif: string;
  treat: string;
}

@Entry
@Component
struct DiabetesDetail {
  @State name: string = '';
  @State patho: string = '';
  @State manif: string = '';
  @State treat: string = '';

  aboutToAppear(): void {
    const params = router.getParams() as DetailParams | undefined;
    if (params !== undefined) {
      this.name = params.name ?? '';
      this.patho = params.patho ?? '';
      this.manif = params.manif ?? '';
      this.treat = params.treat ?? '';
    }
  }

  @Builder
  Section(title: string, iconName: string, iconColor: string, content: string) {
    Column() {
      Row() {
        Icon({ name: iconName, iconSize: 20, color: iconColor })
        Text(title)
          .fontSize(TYPO_TITLE.size)
          .fontWeight(TYPO_TITLE.weight)
          .fontColor(COLOR_INK_700)
          .margin({ left: SPACE_2 })
      }
      .width('100%')

      Text(content)
        .fontSize(TYPO_BODY.size)
        .fontColor(COLOR_INK_500)
        .lineHeight(TYPO_BODY.size * TYPO_BODY.lineHeight)
        .width('100%')
        .margin({ top: SPACE_2 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .backgroundColor(COLOR_PAPER_50)
    .borderRadius(RADIUS_CELL)
    .border({ width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color })
    .padding(SPACE_4)
  }

  build() {
    Column() {
      PageHeader({ title: this.name.length > 0 ? this.name : '糖尿病详情' })

      Scroll() {
        Column({ space: SPACE_3 }) {
          Text(this.name)
            .fontSize(TYPO_HEADLINE.size)
            .fontWeight(TYPO_HEADLINE.weight)
            .fontColor(COLOR_INK_700)
            .width('100%')
            .margin({ top: SPACE_2 })

          if (this.patho.length > 0) {
            this.Section('病因', 'INFO', COLOR_ACCENT_SAGE_500, this.patho)
          }
          if (this.manif.length > 0) {
            this.Section('临床表现', 'WARNING', COLOR_ACCENT_CLAY_500, this.manif)
          }
          if (this.treat.length > 0) {
            this.Section('治疗方式', 'CHECK', COLOR_ACCENT_MIST_500, this.treat)
          }

          Blank().height(SPACE_9)
        }
        .width('100%')
        .padding({ left: SPACE_4, right: SPACE_4, top: SPACE_3 })
      }
      .scrollable(ScrollDirection.Vertical)
      .scrollBar(BarState.Off)
      .layoutWeight(1)
      .width('100%')
    }
    .width('100%')
    .height('100%')
    .backgroundColor(COLOR_PAPER_100)
  }

  pageTransition(): void {
    PageTransitionEnter({ duration: 300, curve: Curve.EaseOut })
      .slide(SlideEffect.Right)
      .opacity(0)
    PageTransitionExit({ duration: 250, curve: Curve.EaseIn })
      .slide(SlideEffect.Right)
      .opacity(0)
  }
}
