import { curves } from '@kit.ArkUI';
import {
  SHADOW_AMBIENT_E1,
  SHADOW_AMBIENT_E2,
  ShadowToken,
  COLOR_PAPER_50,
  RADIUS_CELL,
  STROKE_HAIRLINE,
  SPACE_3,
  MOTION_EASE_MAGNETIC_DURATION
} from '../common/constants/DesignTokens';

const PRESS_SCALE: number = 0.97;
const PRESS_CURVE = curves.cubicBezierCurve(0.32, 0.72, 0, 1);

// A reusable card surface with tactile press feedback (subtle scale-down +
// shadow lift). Carries the card's own background/radius/padding so the shadow
// renders with correct rounded corners. Keeps every card in the app consistent.
@Component
export struct PressableCard {
  @BuilderParam content: () => void;
  onTap?: () => void;
  @Prop bgColor: string = COLOR_PAPER_50;
  @Prop radius: number = RADIUS_CELL;
  @Prop cardPadding: number = SPACE_3;
  @Prop cardWidth: number = 0;
  @Prop marginTop: number = 0;
  @Prop marginBottom: number = 0;
  @Prop marginHorizontal: number = 0;
  @Prop showBorder: boolean = true;
  @Prop restShadow: ShadowToken = SHADOW_AMBIENT_E1;
  @Prop pressShadow: ShadowToken = SHADOW_AMBIENT_E2;
  @State private pressed: boolean = false;

  build(): void {
    Column() {
      this.content()
    }
    .width(this.cardWidth > 0 ? this.cardWidth : '100%')
    .padding(this.cardPadding)
    .backgroundColor(this.bgColor)
    .borderRadius(this.radius)
    .border(this.showBorder
      ? { width: STROKE_HAIRLINE.width, color: STROKE_HAIRLINE.color }
      : { width: 0, color: 'rgba(0,0,0,0)' })
    .margin({
      top: this.marginTop,
      bottom: this.marginBottom,
      left: this.marginHorizontal,
      right: this.marginHorizontal
    })
    .scale({ x: this.pressed ? PRESS_SCALE : 1, y: this.pressed ? PRESS_SCALE : 1 })
    .shadow({
      radius: this.pressed ? this.pressShadow.radius : this.restShadow.radius,
      color: this.pressed ? this.pressShadow.color : this.restShadow.color,
      offsetX: 0,
      offsetY: this.pressed ? this.pressShadow.offsetY : this.restShadow.offsetY
    })
    .animation({ duration: MOTION_EASE_MAGNETIC_DURATION, curve: PRESS_CURVE })
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onClick(() => {
      if (this.onTap !== undefined) {
        this.onTap();
      }
    })
  }
}
