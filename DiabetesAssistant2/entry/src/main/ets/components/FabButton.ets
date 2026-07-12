import { SPACE_9, RADIUS_PILL, COLOR_ACCENT_SAGE_500, COLOR_PAPER_50, SHADOW_AMBIENT_E2 } from '../common/constants/DesignTokens';
import { Icon } from './Icon';
import { UiStore } from '../stores/UiStore';

@Component
export struct FabButton {
  static readonly SIZE: number = SPACE_9;

  build(): void {
    Stack({ alignContent: Alignment.Center }) {
      Icon({ name: 'CHAT', iconSize: 24, color: COLOR_PAPER_50 })
    }
    .width(SPACE_9)
    .height(SPACE_9)
    .borderRadius(RADIUS_PILL)
    .backgroundColor(COLOR_ACCENT_SAGE_500)
    .shadow({ radius: SHADOW_AMBIENT_E2.radius, color: SHADOW_AMBIENT_E2.color, offsetY: SHADOW_AMBIENT_E2.offsetY })
    .onClick(() => { UiStore.getInstance().showChatDialog('assistant') })
  }
}
