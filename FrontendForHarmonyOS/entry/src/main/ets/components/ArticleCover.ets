import { Icon } from './Icon';
import { imageUrl } from '../utils/Helpers';
import {
  COLOR_ACCENT_SAGE_500, COLOR_ACCENT_SAGE_300,
  COLOR_ACCENT_CLAY_500, COLOR_ACCENT_CLAY_300,
  COLOR_ACCENT_MIST_500,
  COLOR_ACCENT_SAND_500,
  COLOR_PAPER_50
} from '../common/constants/DesignTokens';

interface CoverStyle {
  from: string;
  to: string;
  icon: string;
}

function coverStyleFor(category: string): CoverStyle {
  if (category.indexOf('饮食') >= 0) {
    return { from: COLOR_ACCENT_SAGE_500, to: COLOR_ACCENT_SAGE_300, icon: 'FORK_KNIFE' };
  }
  if (category.indexOf('运动') >= 0) {
    return { from: COLOR_ACCENT_CLAY_500, to: COLOR_ACCENT_CLAY_300, icon: 'RUN' };
  }
  if (category.indexOf('生活') >= 0) {
    return { from: COLOR_ACCENT_MIST_500, to: COLOR_ACCENT_SAGE_300, icon: 'CHECK' };
  }
  return { from: COLOR_ACCENT_SAND_500, to: COLOR_ACCENT_CLAY_300, icon: 'NEWS' };
}

@Component
export struct ArticleCover {
  @Prop cover: string | null = null;
  @Prop category: string = '';
  @Prop coverWidth: number = 60;
  @Prop coverHeight: number = 60;
  @Prop radius: number = 16;
  @Prop iconSize: number = 24;

  build(): void {
    if (this.cover !== null && this.cover.length > 0) {
      Image(imageUrl(this.cover))
        .width(this.coverWidth)
        .height(this.coverHeight)
        .borderRadius(this.radius)
        .objectFit(ImageFit.Cover)
        .backgroundColor(coverStyleFor(this.category).from)
    } else {
      Column() {
        Icon({ name: coverStyleFor(this.category).icon, iconSize: this.iconSize, color: COLOR_PAPER_50 })
      }
      .width(this.coverWidth)
      .height(this.coverHeight)
      .borderRadius(this.radius)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .linearGradient({
        angle: 135,
        colors: [[coverStyleFor(this.category).from, 0], [coverStyleFor(this.category).to, 1]]
      })
    }
  }
}
