import { curves } from '@kit.ArkUI';

const ENTER_CURVE = curves.cubicBezierCurve(0.22, 1, 0.36, 1);
const ENTER_DURATION: number = 460;
const ENTER_OFFSET_Y: number = 16;
const STAGGER_STEP: number = 60;
const STAGGER_MAX_INDEX: number = 8;

// Wraps content and plays a fade-in + rise-up entrance animation when it first
// appears. Pass `index` for a staggered cascade across list items.
@Component
export struct FadeInUp {
  @BuilderParam content: () => void;
  @Prop index: number = 0;
  @Prop offsetY: number = ENTER_OFFSET_Y;
  @State private appeared: boolean = false;
  private timerId: number = -1;

  aboutToAppear(): void {
    const cappedIndex: number = this.index > STAGGER_MAX_INDEX ? STAGGER_MAX_INDEX : this.index;
    const delay: number = cappedIndex * STAGGER_STEP;
    this.timerId = setTimeout(() => {
      animateTo({ duration: ENTER_DURATION, curve: ENTER_CURVE }, () => {
        this.appeared = true;
      });
    }, delay);
  }

  aboutToDisappear(): void {
    if (this.timerId !== -1) {
      clearTimeout(this.timerId);
      this.timerId = -1;
    }
  }

  build(): void {
    Column() {
      this.content()
    }
    .width('100%')
    .opacity(this.appeared ? 1 : 0)
    .translate({ y: this.appeared ? 0 : this.offsetY })
  }
}
