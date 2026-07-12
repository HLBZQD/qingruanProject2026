import { router } from '@kit.ArkUI';
import { HomePage } from '../tabs/HomePage';
import { ConsultationPage } from '../tabs/ConsultationPage';
import { LifePlanPage } from '../tabs/LifePlanPage';
import { NewsPage } from '../tabs/NewsPage';
import { ProfilePage } from '../tabs/ProfilePage';
import { TabBar } from '../../components/TabBar';
import { MOTION_EASE_TAB, MOTION_EASE_TAB_DURATION } from '../../common/constants/DesignTokens';

@Entry
@Component
struct RootShell {
  @State currentIndex: number = 0
  private tabsController: TabsController = new TabsController()

  @Builder
  TabBarBuilder() {
    TabBar({
      currentIndex: this.currentIndex,
      onTabChange: (index: number) => {
        this.tabsController.changeIndex(index)
      }
    })
  }

  build() {
    Tabs({ index: this.currentIndex, controller: this.tabsController }) {
      TabContent() { HomePage() }
      TabContent() { ConsultationPage() }
      TabContent() { LifePlanPage() }
      TabContent() { NewsPage() }
      TabContent() { ProfilePage() }
    }
    .barMode(BarMode.Fixed)
    .barHeight(56)
    .width('100%')
    .height('100%')
    .onChange((index: number) => {
      animateTo(
        { duration: MOTION_EASE_TAB_DURATION, curve: MOTION_EASE_TAB },
        () => { this.currentIndex = index }
      )
    })
  }
}
