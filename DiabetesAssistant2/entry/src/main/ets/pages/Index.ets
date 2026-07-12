import { router } from '@kit.ArkUI';
import { UiStore, UiData } from '../stores/UiStore';
import { FabButton } from '../components/FabButton';
import { DisclaimerBar } from '../components/DisclaimerBar';
import { TabBar } from '../components/TabBar';
import { HomePage } from './tabs/HomePage';
import { ConsultationPage } from './tabs/ConsultationPage';
import { LifePlanPage } from './tabs/LifePlanPage';
import { NewsPage } from './tabs/NewsPage';
import { ProfilePage } from './tabs/ProfilePage';
import { PreferencesManager, STORAGE_KEYS } from '../common/persistence/PreferencesManager';
import { SPACE_7 } from '../common/constants/DesignTokens';

@Entry
@Component
struct Index {
  @StorageLink('MAIN_TAB_INDEX') currentTab: number = 0
  private uiData: UiData = UiStore.getInstance().getUiData();

  build() {
    Stack() {
      Column() {
        Column() {
          if (this.currentTab === 0) { HomePage() }
          else if (this.currentTab === 1) { ConsultationPage() }
          else if (this.currentTab === 2) { LifePlanPage() }
          else if (this.currentTab === 3) { NewsPage() }
          else if (this.currentTab === 4) { ProfilePage() }
        }
        .layoutWeight(1)

        TabBar({ currentIndex: this.currentTab, onTabChange: (index: number) => { this.currentTab = index } })
      }
      .width('100%')
      .height('100%')

      if (this.uiData.fabVisible) {
        FabButton()
          .position({ x: '100%', y: '100%' })
          .translate({ x: -(SPACE_7 + 28), y: -(SPACE_7 + 84) })
      }

      if (!this.uiData.disclaimerAccepted) {
        DisclaimerBar({
          onAccept: () => {
            UiStore.getInstance().acceptDisclaimer();
            const pm = PreferencesManager.getInstance();
            if (pm !== null) {
              pm.putBoolean(STORAGE_KEYS.NAME_AUTH, STORAGE_KEYS.DISCLAIMER_ACCEPTED, true);
            }
          },
          onDecline: () => {
            // Do nothing on decline - user stays on current page
          }
        })
      }

    }
    .width('100%')
    .height('100%')
  }
}
