import { describe, it, expect } from '@ohos/hypium';
import * as Tokens from '../main/ets/common/constants/DesignTokens';

export default function designTokensTest(): void {
  describe('DesignTokensTest', () => {
    it('TYPO_DISPLAY_XXXL matches Bible §4', 0, () => {
      expect(Tokens.TYPO_DISPLAY_XXXL.size).assertEqual(44);
      expect(Tokens.TYPO_DISPLAY_XXXL.weight).assertEqual(900);
      expect(Tokens.TYPO_DISPLAY_XXXL.lineHeight).assertEqual(1.02);
      expect(Tokens.TYPO_DISPLAY_XXXL.tracking).assertEqual(-0.6);
    });

    it('TYPO_DISPLAY_L matches Bible §4', 0, () => {
      expect(Tokens.TYPO_DISPLAY_L.size).assertEqual(36);
      expect(Tokens.TYPO_DISPLAY_L.weight).assertEqual(700);
      expect(Tokens.TYPO_DISPLAY_L.lineHeight).assertEqual(1.05);
      expect(Tokens.TYPO_DISPLAY_L.tracking).assertEqual(-0.5);
    });

    it('TYPO_DISPLAY_M matches Bible §4', 0, () => {
      expect(Tokens.TYPO_DISPLAY_M.size).assertEqual(28);
      expect(Tokens.TYPO_DISPLAY_M.weight).assertEqual(700);
      expect(Tokens.TYPO_DISPLAY_M.lineHeight).assertEqual(1.10);
      expect(Tokens.TYPO_DISPLAY_M.tracking).assertEqual(-0.4);
    });

    it('TYPO_HEADLINE matches Bible §4', 0, () => {
      expect(Tokens.TYPO_HEADLINE.size).assertEqual(22);
      expect(Tokens.TYPO_HEADLINE.weight).assertEqual(600);
      expect(Tokens.TYPO_HEADLINE.lineHeight).assertEqual(1.18);
      expect(Tokens.TYPO_HEADLINE.tracking).assertEqual(-0.2);
    });

    it('TYPO_TITLE matches Bible §4', 0, () => {
      expect(Tokens.TYPO_TITLE.size).assertEqual(18);
      expect(Tokens.TYPO_TITLE.weight).assertEqual(600);
      expect(Tokens.TYPO_TITLE.lineHeight).assertEqual(1.25);
      expect(Tokens.TYPO_TITLE.tracking).assertEqual(0);
    });

    it('TYPO_SUBTITLE matches Bible §4', 0, () => {
      expect(Tokens.TYPO_SUBTITLE.size).assertEqual(15);
      expect(Tokens.TYPO_SUBTITLE.weight).assertEqual(500);
      expect(Tokens.TYPO_SUBTITLE.lineHeight).assertEqual(1.30);
      expect(Tokens.TYPO_SUBTITLE.tracking).assertEqual(0);
    });

    it('TYPO_BODY matches Bible §4', 0, () => {
      expect(Tokens.TYPO_BODY.size).assertEqual(14);
      expect(Tokens.TYPO_BODY.weight).assertEqual(400);
      expect(Tokens.TYPO_BODY.lineHeight).assertEqual(1.45);
      expect(Tokens.TYPO_BODY.tracking).assertEqual(0);
    });

    it('TYPO_BODY_STRONG matches Bible §4', 0, () => {
      expect(Tokens.TYPO_BODY_STRONG.size).assertEqual(14);
      expect(Tokens.TYPO_BODY_STRONG.weight).assertEqual(600);
      expect(Tokens.TYPO_BODY_STRONG.lineHeight).assertEqual(1.40);
      expect(Tokens.TYPO_BODY_STRONG.tracking).assertEqual(0);
    });

    it('TYPO_LABEL matches Bible §4', 0, () => {
      expect(Tokens.TYPO_LABEL.size).assertEqual(12);
      expect(Tokens.TYPO_LABEL.weight).assertEqual(500);
      expect(Tokens.TYPO_LABEL.lineHeight).assertEqual(1.20);
      expect(Tokens.TYPO_LABEL.tracking).assertEqual(0.4);
    });

    it('TYPO_CAPTION matches Bible §4', 0, () => {
      expect(Tokens.TYPO_CAPTION.size).assertEqual(11);
      expect(Tokens.TYPO_CAPTION.weight).assertEqual(400);
      expect(Tokens.TYPO_CAPTION.lineHeight).assertEqual(1.30);
      expect(Tokens.TYPO_CAPTION.tracking).assertEqual(0);
    });

    it('TYPO_EYEBROW matches Bible §4', 0, () => {
      expect(Tokens.TYPO_EYEBROW.size).assertEqual(10);
      expect(Tokens.TYPO_EYEBROW.weight).assertEqual(500);
      expect(Tokens.TYPO_EYEBROW.lineHeight).assertEqual(1.20);
      expect(Tokens.TYPO_EYEBROW.tracking).assertEqual(1.5);
    });

    it('TYPO_METRIC matches Bible §4', 0, () => {
      expect(Tokens.TYPO_METRIC.size).assertEqual(48);
      expect(Tokens.TYPO_METRIC.weight).assertEqual(600);
      expect(Tokens.TYPO_METRIC.lineHeight).assertEqual(1.00);
      expect(Tokens.TYPO_METRIC.tracking).assertEqual(-0.6);
    });

    it('FONT_FAMILY_DISPLAY matches Bible §4', 0, () => {
      expect(Tokens.FONT_FAMILY_DISPLAY).assertEqual('HarmonyOS Sans Display');
    });

    it('FONT_FAMILY_BODY matches Bible §4', 0, () => {
      expect(Tokens.FONT_FAMILY_BODY).assertEqual('HarmonyOS Sans');
    });

    it('FONT_FAMILY_MONO matches Bible §4', 0, () => {
      expect(Tokens.FONT_FAMILY_MONO).assertEqual('HarmonyOS Sans Mono');
    });

    it('SPACE_* match Bible §5', 0, () => {
      expect(Tokens.SPACE_0).assertEqual(0);
      expect(Tokens.SPACE_1).assertEqual(4);
      expect(Tokens.SPACE_2).assertEqual(8);
      expect(Tokens.SPACE_3).assertEqual(12);
      expect(Tokens.SPACE_4).assertEqual(16);
      expect(Tokens.SPACE_5).assertEqual(20);
      expect(Tokens.SPACE_6).assertEqual(24);
      expect(Tokens.SPACE_7).assertEqual(32);
      expect(Tokens.SPACE_8).assertEqual(40);
      expect(Tokens.SPACE_9).assertEqual(56);
      expect(Tokens.SPACE_10).assertEqual(72);
      expect(Tokens.SPACE_11).assertEqual(96);
      expect(Tokens.SPACE_12).assertEqual(128);
    });

    it('RADIUS_* match Bible §6', 0, () => {
      expect(Tokens.RADIUS_PILL).assertEqual(100);
      expect(Tokens.RADIUS_HERO).assertEqual(32);
      expect(Tokens.RADIUS_CARD_OUTER).assertEqual(28);
      expect(Tokens.RADIUS_CARD_INNER).assertEqual(22);
      expect(Tokens.RADIUS_CELL).assertEqual(18);
      expect(Tokens.RADIUS_MEDIA).assertEqual(16);
      expect(Tokens.RADIUS_BUBBLE).assertEqual(20);
      expect(Tokens.RADIUS_TAG).assertEqual(12);
      expect(Tokens.RADIUS_PILL_MINI).assertEqual(14);
    });

    it('Double-Bezel radius invariant: outer - inner === 6', 0, () => {
      expect(Tokens.RADIUS_CARD_OUTER - Tokens.RADIUS_CARD_INNER).assertEqual(6);
    });

    it('COLOR_INK_* match Bible §7 Neutral Inks', 0, () => {
      expect(Tokens.COLOR_INK_900).assertEqual('#1A1C20');
      expect(Tokens.COLOR_INK_800).assertEqual('#25272B');
      expect(Tokens.COLOR_INK_700).assertEqual('#3A3D43');
      expect(Tokens.COLOR_INK_600).assertEqual('#5A5D63');
      expect(Tokens.COLOR_INK_500).assertEqual('#7A7E85');
      expect(Tokens.COLOR_INK_400).assertEqual('#A0A3A8');
      expect(Tokens.COLOR_INK_300).assertEqual('#C5C8CC');
      expect(Tokens.COLOR_INK_200).assertEqual('#E5E7E9');
      expect(Tokens.COLOR_INK_100).assertEqual('#F2F3F4');
    });

    it('COLOR_PAPER_* match Bible §7 Warm Cream', 0, () => {
      expect(Tokens.COLOR_PAPER_50).assertEqual('#FAF9F6');
      expect(Tokens.COLOR_PAPER_100).assertEqual('#F5F3EE');
      expect(Tokens.COLOR_PAPER_200).assertEqual('#EDE9E0');
    });

    it('COLOR_ACCENT_* match Bible §7 Signature Accent', 0, () => {
      expect(Tokens.COLOR_ACCENT_SAGE_600).assertEqual('#3E5641');
      expect(Tokens.COLOR_ACCENT_SAGE_500).assertEqual('#4F7052');
      expect(Tokens.COLOR_ACCENT_SAGE_300).assertEqual('#A7C0A8');
      expect(Tokens.COLOR_ACCENT_CLAY_600).assertEqual('#8E5447');
      expect(Tokens.COLOR_ACCENT_CLAY_500).assertEqual('#B26953');
      expect(Tokens.COLOR_ACCENT_CLAY_300).assertEqual('#D4A48E');
      expect(Tokens.COLOR_ACCENT_MIST_500).assertEqual('#63747D');
      expect(Tokens.COLOR_ACCENT_SAND_500).assertEqual('#D5C6A1');
    });

    it('COLOR_SUCCESS/WARN/DANGER/INFO match Bible §7 Functional', 0, () => {
      expect(Tokens.COLOR_SUCCESS_600).assertEqual('#5B7560');
      expect(Tokens.COLOR_WARN_600).assertEqual('#B4824A');
      expect(Tokens.COLOR_DANGER_600).assertEqual('#9B5151');
      expect(Tokens.COLOR_INFO_500).assertEqual('#63747D');
    });

    it('SHADOW_AMBIENT_E* match Bible §7', 0, () => {
      expect(Tokens.SHADOW_AMBIENT_E0.color).assertEqual('rgba(24,24,24,0.04)');
      expect(Tokens.SHADOW_AMBIENT_E0.radius).assertEqual(16);
      expect(Tokens.SHADOW_AMBIENT_E0.offsetY).assertEqual(4);
      expect(Tokens.SHADOW_AMBIENT_E1.color).assertEqual('rgba(24,24,24,0.05)');
      expect(Tokens.SHADOW_AMBIENT_E1.radius).assertEqual(24);
      expect(Tokens.SHADOW_AMBIENT_E1.offsetY).assertEqual(6);
      expect(Tokens.SHADOW_AMBIENT_E2.color).assertEqual('rgba(24,24,24,0.06)');
      expect(Tokens.SHADOW_AMBIENT_E2.radius).assertEqual(36);
      expect(Tokens.SHADOW_AMBIENT_E2.offsetY).assertEqual(12);
      expect(Tokens.SHADOW_AMBIENT_E3.color).assertEqual('rgba(24,24,24,0.08)');
      expect(Tokens.SHADOW_AMBIENT_E3.radius).assertEqual(48);
      expect(Tokens.SHADOW_AMBIENT_E3.offsetY).assertEqual(20);
    });

    it('STROKE_* match Bible §7', 0, () => {
      expect(Tokens.STROKE_HAIRLINE.width).assertEqual(1);
      expect(Tokens.STROKE_HAIRLINE.color).assertEqual('rgba(26,28,32,0.08)');
      expect(Tokens.STROKE_STRONG.width).assertEqual(1);
      expect(Tokens.STROKE_STRONG.color).assertEqual('rgba(26,28,32,0.14)');
    });

    it('MOTION_EASE_PHOENIX matches Bible §9', 0, () => {
      expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.x1).assertEqual(0.32);
      expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.y1).assertEqual(0.72);
      expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.x2).assertEqual(0);
      expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.y2).assertEqual(1);
      expect(Tokens.MOTION_EASE_PHOENIX_DURATION).assertEqual(600);
      expect(Tokens.MOTION_EASE_PHOENIX).assertNotNull();
      expect(typeof Tokens.MOTION_EASE_PHOENIX.interpolate).assertEqual('function');
    });

    it('MOTION_EASE_EMPHASIS matches Bible §9', 0, () => {
      expect(Tokens.MOTION_EASE_EMPHASIS_PARAMS.x1).assertEqual(0.22);
      expect(Tokens.MOTION_EASE_EMPHASIS_PARAMS.y1).assertEqual(1);
      expect(Tokens.MOTION_EASE_EMPHASIS_PARAMS.x2).assertEqual(0.36);
      expect(Tokens.MOTION_EASE_EMPHASIS_PARAMS.y2).assertEqual(1);
      expect(Tokens.MOTION_EASE_EMPHASIS_DURATION).assertEqual(800);
      expect(Tokens.MOTION_EASE_EMPHASIS).assertNotNull();
      expect(typeof Tokens.MOTION_EASE_EMPHASIS.interpolate).assertEqual('function');
    });

    it('MOTION_EASE_MAGNETIC matches Bible §9', 0, () => {
      expect(Tokens.MOTION_EASE_MAGNETIC_PARAMS.x1).assertEqual(0.32);
      expect(Tokens.MOTION_EASE_MAGNETIC_PARAMS.y1).assertEqual(0.72);
      expect(Tokens.MOTION_EASE_MAGNETIC_PARAMS.x2).assertEqual(0);
      expect(Tokens.MOTION_EASE_MAGNETIC_PARAMS.y2).assertEqual(1);
      expect(Tokens.MOTION_EASE_MAGNETIC_DURATION).assertEqual(200);
      expect(Tokens.MOTION_EASE_MAGNETIC).assertNotNull();
      expect(typeof Tokens.MOTION_EASE_MAGNETIC.interpolate).assertEqual('function');
    });

    it('MOTION_EASE_SHEET matches Bible §9', 0, () => {
      expect(Tokens.MOTION_EASE_SHEET_PARAMS.x1).assertEqual(0.16);
      expect(Tokens.MOTION_EASE_SHEET_PARAMS.y1).assertEqual(1);
      expect(Tokens.MOTION_EASE_SHEET_PARAMS.x2).assertEqual(0.3);
      expect(Tokens.MOTION_EASE_SHEET_PARAMS.y2).assertEqual(1);
      expect(Tokens.MOTION_EASE_SHEET_DURATION).assertEqual(400);
      expect(Tokens.MOTION_EASE_SHEET).assertNotNull();
      expect(typeof Tokens.MOTION_EASE_SHEET.interpolate).assertEqual('function');
    });

    it('MOTION_EASE_TAB matches Bible §9', 0, () => {
      expect(Tokens.MOTION_EASE_TAB_PARAMS.x1).assertEqual(0.32);
      expect(Tokens.MOTION_EASE_TAB_PARAMS.y1).assertEqual(0.72);
      expect(Tokens.MOTION_EASE_TAB_PARAMS.x2).assertEqual(0);
      expect(Tokens.MOTION_EASE_TAB_PARAMS.y2).assertEqual(1);
      expect(Tokens.MOTION_EASE_TAB_DURATION).assertEqual(320);
      expect(Tokens.MOTION_EASE_TAB).assertNotNull();
      expect(typeof Tokens.MOTION_EASE_TAB.interpolate).assertEqual('function');
    });
  });
}