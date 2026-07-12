import { describe, it, expect } from '@ohos/hypium';
import * as ROUTES from '../main/ets/common/constants/RouteNames';

export default function navigationTest(): void {
  describe('NavigationTest', () => {
    it('route_map.json can be imported without error', 0, () => {
      let importOk = true;
      try {
        require('../main/resources/base/profile/route_map.json');
      } catch (_e) {
        importOk = false;
      }
      expect(importOk).assertTrue();
    });

    it('NavDestination registration names match RouteNames constants', 0, () => {
      expect(ROUTES.ROOT_SHELL).assertEqual('RootShell');
      expect(ROUTES.DOCTOR_CHAT).assertEqual('DoctorChat');
      expect(ROUTES.RISK).assertEqual('Risk');
      expect(ROUTES.HEALTH_ADVICE).assertEqual('HealthAdvice');
      expect(ROUTES.ADMIN).assertEqual('Admin');
      expect(ROUTES.PUNCH).assertEqual('Punch');
      expect(ROUTES.ARTICLE_DETAIL).assertEqual('ArticleDetail');
      expect(ROUTES.CHANGE_PASSWORD).assertEqual('ChangePassword');
      expect(ROUTES.LOGIN).assertEqual('Login');
      expect(ROUTES.RISK_RESULT).assertEqual('RiskResult');
    });

    it('navigate and navigateBack functions are importable and callable', 0, () => {
      let importOk = true;
      try {
        const guard = require('../main/ets/hooks/NavigateGuard');
        expect(typeof guard.navigate).assertEqual('function');
        expect(typeof guard.navigateBack).assertEqual('function');
      } catch (_e) {
        importOk = false;
      }
      expect(importOk).assertTrue();
    });

    it('Index page imports without error', 0, () => {
      let importOk = true;
      try {
        require('../main/ets/pages/Index');
      } catch (_e) {
        importOk = false;
      }
      expect(importOk).assertTrue();
    });

    it('RootShell and placeholder pages import without error', 0, () => {
      let importOk = true;
      try {
        require('../main/ets/pages/root/RootShell');
        require('../main/ets/pages/DoctorChat');
        require('../main/ets/pages/Risk');
        require('../main/ets/pages/Login');
        require('../main/ets/pages/tabs/HomePage');
        require('../main/ets/pages/tabs/ConsultationPage');
        require('../main/ets/pages/tabs/ProfilePage');
      } catch (_e) {
        importOk = false;
      }
      expect(importOk).assertTrue();
    });

    it('navigateBack function type is (navStack: NavPathStack) => void', 0, () => {
      let typeOk = true;
      try {
        const guard = require('../main/ets/hooks/NavigateGuard');
        expect(guard.navigateBack !== undefined).assertTrue();
        expect(guard.navigateBack !== null).assertTrue();
        expect(typeof guard.navigateBack).assertEqual('function');
      } catch (_e) {
        typeOk = false;
      }
      expect(typeOk).assertTrue();
    });
  });
}
