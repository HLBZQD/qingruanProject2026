import { describe, it, expect } from '@ohos/hypium';
import * as Routes from '../main/ets/common/constants/RouteNames';

export default function routeNamesTest(): void {
  describe('RouteNamesTest', () => {
    const EXPECTED_NAMES: string[] = [
      'ROOT_SHELL', 'DOCTOR_CHAT', 'RISK', 'PUNCH', 'HEALTH_ADVICE',
      'ARTICLE_DETAIL', 'ADMIN', 'CHANGE_PASSWORD', 'LOGIN', 'RISK_RESULT'
    ];

    it('each RouteName constant value is non-empty PascalCase string', 0, () => {
      EXPECTED_NAMES.forEach(name => {
        expect(Routes[name]).assertNotNull();
        expect(typeof Routes[name]).assertEqual('string');
        expect((Routes[name] as string).length > 0).assertTrue();
        expect((Routes[name] as string)[0] === (Routes[name] as string)[0].toUpperCase()).assertTrue();
        expect((Routes[name] as string).includes('_')).assertFalse();
        expect((Routes[name] as string).includes('-')).assertFalse();
        expect((Routes[name] as string).includes(' ')).assertFalse();
      });
    });

    it('exactly 10 RouteName constants defined', 0, () => {
      const routeKeys = Object.keys(Routes).filter(k => k[0] >= 'A' && k[0] <= 'Z');
      expect(routeKeys.length).assertEqual(10);
      EXPECTED_NAMES.forEach(name => {
        expect(Routes[name] !== undefined).assertTrue();
      });
    });

    it('all 10 RouteName values are distinct', 0, () => {
      const values = EXPECTED_NAMES.map(name => Routes[name]);
      expect(new Set(values).size).assertEqual(10);
    });

    it('specific RouteName values match expected', 0, () => {
      expect(Routes.ROOT_SHELL).assertEqual('RootShell');
      expect(Routes.DOCTOR_CHAT).assertEqual('DoctorChat');
      expect(Routes.RISK_RESULT).assertEqual('RiskResult');
      expect(Routes.LOGIN).assertEqual('Login');
    });
  });
}
