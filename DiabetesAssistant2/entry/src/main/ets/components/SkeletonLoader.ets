import { COLOR_INK_100, COLOR_INK_200, RADIUS_CELL, RADIUS_PILL, SPACE_3, SPACE_4, SPACE_12 } from '../common/constants/DesignTokens';

@Component
struct SkeletonBlock {
  @Prop blockWidth: number = 0;
  @Prop blockHeight: number = SPACE_4;
  @Prop blockRadius: number = RADIUS_CELL;
  @Prop loading: boolean = true;
  @State animOpacity: number = 0.5;
  private timerId: number = -1;

  aboutToAppear(): void {
    if (this.loading) {
      this.timerId = setInterval(() => {
        animateTo({ duration: 600, curve: Curve.Linear }, () => {
          this.animOpacity = this.animOpacity === 0.5 ? 1.0 : 0.5;
        })
      }, 1200)
    }
  }

  aboutToDisappear(): void {
    clearInterval(this.timerId);
  }

  build(): void {
    Row()
      .width(this.blockWidth === 0 ? '100%' : this.blockWidth)
      .height(this.blockHeight)
      .borderRadius(this.blockRadius)
      .backgroundColor(COLOR_INK_100)
      .opacity(this.loading ? this.animOpacity : 1.0)
  }
}

@Component
struct SkeletonLines {
  @Prop count: number = 3;
  @Prop lineHeight: number = SPACE_4;
  @Prop gap: number = SPACE_3;
  @Prop lastWidth: number = 0.6;
  @Prop loading: boolean = true;

  build(): void {
    Column({ space: this.gap }) {
      ForEach(SkeletonLines.buildIndices(this.count), (item: number) => {
        if (item === this.count - 1) {
          SkeletonBlock({ blockWidth: 0, blockHeight: this.lineHeight, loading: this.loading })
            .width(`${this.lastWidth * 100}%`)
        } else {
          SkeletonBlock({ blockWidth: 0, blockHeight: this.lineHeight, loading: this.loading })
        }
      }, (item: number) => item.toString())
    }
    .width('100%')
  }

  static buildIndices(count: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
      result.push(i);
    }
    return result;
  }
}

@Component
export struct SkeletonLoader {
  static readonly SKELETON_ANIMATION_DURATION: number = 1200;
  static readonly SKELETON_COLOR: string = COLOR_INK_100;
  static readonly SKELETON_HIGHLIGHT_COLOR: string = COLOR_INK_200;

  @Prop variant: string = 'lines';
  @Prop count: number = 3;
  @Prop lineHeight: number = SPACE_4;
  @Prop gap: number = SPACE_3;
  @Prop lastWidth: number = 0.6;
  @Prop loading: boolean = true;

  build(): void {
    Column() {
      if (this.variant === 'lines') {
        SkeletonLines({ count: this.count, lineHeight: this.lineHeight, gap: this.gap, lastWidth: this.lastWidth, loading: this.loading })
      } else if (this.variant === 'card') {
        Column({ space: SPACE_3 }) {
          SkeletonBlock({ blockWidth: 0, blockHeight: SPACE_12, loading: this.loading })
          SkeletonBlock({ blockWidth: 0, blockHeight: SPACE_12, loading: this.loading })
        }
      } else if (this.variant === 'avatar-list') {
        Row({ space: SPACE_3 }) {
          SkeletonBlock({ blockWidth: 40, blockHeight: 40, blockRadius: RADIUS_PILL, loading: this.loading })
          Column({ space: SPACE_3 }) {
            SkeletonLines({ count: 2, lineHeight: this.lineHeight, gap: SPACE_3, loading: this.loading })
          }.layoutWeight(1)
        }
      } else {
        SkeletonLines({ count: this.count, lineHeight: this.lineHeight, gap: this.gap, lastWidth: this.lastWidth, loading: this.loading })
      }
    }
    .width('100%')
    .padding(SPACE_4)
  }
}
