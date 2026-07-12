import { COLOR_ACCENT_SAGE_500, COLOR_INK_400, COLOR_INK_500, COLOR_PAPER_50, COLOR_INK_200, TYPO_LABEL, SPACE_1 } from '../common/constants/DesignTokens';
import { Icon } from './Icon';

export interface TabItem {
  icon: string;
  label: string;
}

export const TAB_ITEMS: TabItem[] = [
  { icon: 'HOME', label: '首页' },
  { icon: 'CONSULT', label: '咨询' },
  { icon: 'LIFEPLAN', label: '生活方案' },
  { icon: 'NEWS', label: '资讯' },
  { icon: 'PROFILE', label: '我的' }
];

@Component
export struct TabBar {
  @Prop currentIndex: number = 0;
  onTabChange?: (index: number) => void;

  build() {
    Column() {
      Divider()
        .strokeWidth(0.5)
        .color(COLOR_INK_200)

      Row() {
        Button({ type: ButtonType.Normal }) {
          Column({ space: SPACE_1 }) {
            Icon({ name: TAB_ITEMS[0].icon, iconSize: 28, color: this.currentIndex === 0 ? COLOR_ACCENT_SAGE_500 : COLOR_INK_400 })
            Text(TAB_ITEMS[0].label)
              .fontSize(TYPO_LABEL.size)
              .fontWeight(TYPO_LABEL.weight)
              .fontColor(this.currentIndex === 0 ? COLOR_ACCENT_SAGE_500 : COLOR_INK_500)
          }
        }
        .backgroundColor(Color.Transparent)
        .type(ButtonType.Normal)
        .layoutWeight(1)
        .onClick(() => { if (this.onTabChange !== undefined) { this.onTabChange(0); } })

        Button({ type: ButtonType.Normal }) {
          Column({ space: SPACE_1 }) {
            Icon({ name: TAB_ITEMS[1].icon, iconSize: 28, color: this.currentIndex === 1 ? COLOR_ACCENT_SAGE_500 : COLOR_INK_400 })
            Text(TAB_ITEMS[1].label)
              .fontSize(TYPO_LABEL.size)
              .fontWeight(TYPO_LABEL.weight)
              .fontColor(this.currentIndex === 1 ? COLOR_ACCENT_SAGE_500 : COLOR_INK_500)
          }
        }
        .backgroundColor(Color.Transparent)
        .type(ButtonType.Normal)
        .layoutWeight(1)
        .onClick(() => { if (this.onTabChange !== undefined) { this.onTabChange(1); } })

        Button({ type: ButtonType.Normal }) {
          Column({ space: SPACE_1 }) {
            Icon({ name: TAB_ITEMS[2].icon, iconSize: 28, color: this.currentIndex === 2 ? COLOR_ACCENT_SAGE_500 : COLOR_INK_400 })
            Text(TAB_ITEMS[2].label)
              .fontSize(TYPO_LABEL.size)
              .fontWeight(TYPO_LABEL.weight)
              .fontColor(this.currentIndex === 2 ? COLOR_ACCENT_SAGE_500 : COLOR_INK_500)
          }
        }
        .backgroundColor(Color.Transparent)
        .type(ButtonType.Normal)
        .layoutWeight(1)
        .onClick(() => { if (this.onTabChange !== undefined) { this.onTabChange(2); } })

        Button({ type: ButtonType.Normal }) {
          Column({ space: SPACE_1 }) {
            Icon({ name: TAB_ITEMS[3].icon, iconSize: 28, color: this.currentIndex === 3 ? COLOR_ACCENT_SAGE_500 : COLOR_INK_400 })
            Text(TAB_ITEMS[3].label)
              .fontSize(TYPO_LABEL.size)
              .fontWeight(TYPO_LABEL.weight)
              .fontColor(this.currentIndex === 3 ? COLOR_ACCENT_SAGE_500 : COLOR_INK_500)
          }
        }
        .backgroundColor(Color.Transparent)
        .type(ButtonType.Normal)
        .layoutWeight(1)
        .onClick(() => { if (this.onTabChange !== undefined) { this.onTabChange(3); } })

        Button({ type: ButtonType.Normal }) {
          Column({ space: SPACE_1 }) {
            Icon({ name: TAB_ITEMS[4].icon, iconSize: 28, color: this.currentIndex === 4 ? COLOR_ACCENT_SAGE_500 : COLOR_INK_400 })
            Text(TAB_ITEMS[4].label)
              .fontSize(TYPO_LABEL.size)
              .fontWeight(TYPO_LABEL.weight)
              .fontColor(this.currentIndex === 4 ? COLOR_ACCENT_SAGE_500 : COLOR_INK_500)
          }
        }
        .backgroundColor(Color.Transparent)
        .type(ButtonType.Normal)
        .layoutWeight(1)
        .onClick(() => { if (this.onTabChange !== undefined) { this.onTabChange(4); } })
      }
      .width('100%')
      .height(55.5)
      .backgroundColor(COLOR_PAPER_50)
    }
    .backgroundColor(COLOR_PAPER_50)
    .width('100%')
  }
}
