import { describe, it, expect } from '@ohos/hypium';
import * as Tokens from '../main/ets/common/constants/DesignTokens';

// ---- helpers (pure, test-only) ----
function isHexColor(c: string): boolean {
  if (c.length !== 7) {
    return false;
  }
  if (c.charAt(0) !== '#') {
    return false;
  }
  const hex = '0123456789ABCDEFabcdef';
  for (let i = 1; i < 7; i++) {
    if (hex.indexOf(c.charAt(i)) < 0) {
      return false;
    }
  }
  return true;
}

function rgbaAlpha(rgba: string): number {
  const open = rgba.indexOf('(');
  const close = rgba.lastIndexOf(')');
  const inner = rgba.substring(open + 1, close);
  const parts: string[] = inner.split(',');
  return Number(parts[3]);
}

export default function designTokensContractTest(): void {
  describe('DesignTokensContractTest', () => {

    // ==================== Typography (Bible §4) ====================
    describe('Typography', () => {
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
      it('FONT_FAMILY_* match Bible §4', 0, () => {
        expect(Tokens.FONT_FAMILY_DISPLAY).assertEqual('HarmonyOS Sans Display');
        expect(Tokens.FONT_FAMILY_BODY).assertEqual('HarmonyOS Sans');
        expect(Tokens.FONT_FAMILY_MONO).assertEqual('HarmonyOS Sans Mono');
      });
      // boundary: cross-token field invariants (independent of exact values)
      it('typography fields satisfy domain bounds', 0, () => {
        const all: Tokens.TypographyToken[] = [
          Tokens.TYPO_DISPLAY_XXXL, Tokens.TYPO_DISPLAY_L, Tokens.TYPO_DISPLAY_M,
          Tokens.TYPO_HEADLINE, Tokens.TYPO_TITLE, Tokens.TYPO_SUBTITLE,
          Tokens.TYPO_BODY, Tokens.TYPO_BODY_STRONG, Tokens.TYPO_LABEL,
          Tokens.TYPO_CAPTION, Tokens.TYPO_EYEBROW, Tokens.TYPO_METRIC,
        ];
        for (const t of all) {
          expect(t.size > 0).assertTrue();
          expect(t.weight >= 100 && t.weight <= 900).assertTrue();
          expect(t.lineHeight >= 1.00).assertTrue();
          expect(t.tracking !== undefined && t.tracking !== null).assertTrue();
        }
      });
    });

    // ==================== Spatial (Bible §5) ====================
    describe('Spatial', () => {
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
      // boundary: monotonic non-decreasing scale
      it('SPACE_* scale is monotonically non-decreasing', 0, () => {
        const arr: number[] = [
          Tokens.SPACE_0, Tokens.SPACE_1, Tokens.SPACE_2, Tokens.SPACE_3,
          Tokens.SPACE_4, Tokens.SPACE_5, Tokens.SPACE_6, Tokens.SPACE_7,
          Tokens.SPACE_8, Tokens.SPACE_9, Tokens.SPACE_10, Tokens.SPACE_11,
          Tokens.SPACE_12,
        ];
        for (let i = 1; i < arr.length; i++) {
          expect(arr[i] >= arr[i - 1]).assertTrue();
        }
      });
      // boundary: endpoints
      it('SPACE_0 is zero (lower bound)', 0, () => {
        expect(Tokens.SPACE_0).assertEqual(0);
      });
    });

    // ==================== Radius (Bible §6) ====================
    describe('Radius', () => {
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
      // Bible §6 Critical invariant
      it('Double-Bezel invariant: RADIUS_CARD_OUTER - RADIUS_CARD_INNER === 6', 0, () => {
        expect(Tokens.RADIUS_CARD_OUTER - Tokens.RADIUS_CARD_INNER).assertEqual(6);
      });
      // boundary: all radii positive
      it('all RADIUS_* are positive', 0, () => {
        expect(Tokens.RADIUS_PILL > 0).assertTrue();
        expect(Tokens.RADIUS_HERO > 0).assertTrue();
        expect(Tokens.RADIUS_CARD_OUTER > 0).assertTrue();
        expect(Tokens.RADIUS_CARD_INNER > 0).assertTrue();
        expect(Tokens.RADIUS_CELL > 0).assertTrue();
        expect(Tokens.RADIUS_MEDIA > 0).assertTrue();
        expect(Tokens.RADIUS_BUBBLE > 0).assertTrue();
        expect(Tokens.RADIUS_TAG > 0).assertTrue();
        expect(Tokens.RADIUS_PILL_MINI > 0).assertTrue();
      });
    });

    // ==================== Color — Neutral Inks (Bible §7) ====================
    describe('ColorNeutralInks', () => {
      it('COLOR_INK_* match Bible §7', 0, () => {
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
    });

    // ==================== Color — Warm Cream Surfaces (Bible §7) ====================
    describe('ColorWarmCream', () => {
      it('COLOR_PAPER_* match Bible §7', 0, () => {
        expect(Tokens.COLOR_PAPER_50).assertEqual('#FAF9F6');
        expect(Tokens.COLOR_PAPER_100).assertEqual('#F5F3EE');
        expect(Tokens.COLOR_PAPER_200).assertEqual('#EDE9E0');
      });
    });

    // ==================== Color — Signature Accent (Bible §7) ====================
    describe('ColorSignatureAccent', () => {
      it('COLOR_ACCENT_* match Bible §7', 0, () => {
        expect(Tokens.COLOR_ACCENT_SAGE_600).assertEqual('#3E5641');
        expect(Tokens.COLOR_ACCENT_SAGE_500).assertEqual('#4F7052');
        expect(Tokens.COLOR_ACCENT_SAGE_300).assertEqual('#A7C0A8');
        expect(Tokens.COLOR_ACCENT_CLAY_600).assertEqual('#8E5447');
        expect(Tokens.COLOR_ACCENT_CLAY_500).assertEqual('#B26953');
        expect(Tokens.COLOR_ACCENT_CLAY_300).assertEqual('#D4A48E');
        expect(Tokens.COLOR_ACCENT_MIST_500).assertEqual('#63747D');
        expect(Tokens.COLOR_ACCENT_SAND_500).assertEqual('#D5C6A1');
      });
    });

    // ==================== Color — Functional Accents (Bible §7) ====================
    describe('ColorFunctional', () => {
      it('COLOR_SUCCESS/WARN/DANGER/INFO match Bible §7', 0, () => {
        expect(Tokens.COLOR_SUCCESS_600).assertEqual('#5B7560');
        expect(Tokens.COLOR_WARN_600).assertEqual('#B4824A');
        expect(Tokens.COLOR_DANGER_600).assertEqual('#9B5151');
        expect(Tokens.COLOR_INFO_500).assertEqual('#63747D');
      });
      // semantic independence: INFO_500 and ACCENT_MIST_500 share value but are independent exports
      it('COLOR_INFO_500 and COLOR_ACCENT_MIST_500 share value (Bible §7 same color)', 0, () => {
        expect(Tokens.COLOR_INFO_500).assertEqual(Tokens.COLOR_ACCENT_MIST_500);
      });
    });

    // ==================== Color format boundary (all 24 hex) ====================
    describe('ColorFormat', () => {
      it('all color constants are valid #RRGGBB hex', 0, () => {
        const all: string[] = [
          Tokens.COLOR_INK_900, Tokens.COLOR_INK_800, Tokens.COLOR_INK_700,
          Tokens.COLOR_INK_600, Tokens.COLOR_INK_500, Tokens.COLOR_INK_400,
          Tokens.COLOR_INK_300, Tokens.COLOR_INK_200, Tokens.COLOR_INK_100,
          Tokens.COLOR_PAPER_50, Tokens.COLOR_PAPER_100, Tokens.COLOR_PAPER_200,
          Tokens.COLOR_ACCENT_SAGE_600, Tokens.COLOR_ACCENT_SAGE_500,
          Tokens.COLOR_ACCENT_SAGE_300, Tokens.COLOR_ACCENT_CLAY_600,
          Tokens.COLOR_ACCENT_CLAY_500, Tokens.COLOR_ACCENT_CLAY_300,
          Tokens.COLOR_ACCENT_MIST_500, Tokens.COLOR_ACCENT_SAND_500,
          Tokens.COLOR_SUCCESS_600, Tokens.COLOR_WARN_600,
          Tokens.COLOR_DANGER_600, Tokens.COLOR_INFO_500,
        ];
        expect(all.length).assertEqual(24);
        for (const c of all) {
          expect(isHexColor(c)).assertTrue();
        }
      });
    });

    // ==================== Shadow (Bible §7) ====================
    describe('Shadow', () => {
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
      // Bible §2 constraint: no shadow alpha >= 0.2
      it('SHADOW_AMBIENT_* alpha < 0.2 (Bible §2 shadow constraint)', 0, () => {
        expect(rgbaAlpha(Tokens.SHADOW_AMBIENT_E0.color) < 0.2).assertTrue();
        expect(rgbaAlpha(Tokens.SHADOW_AMBIENT_E1.color) < 0.2).assertTrue();
        expect(rgbaAlpha(Tokens.SHADOW_AMBIENT_E2.color) < 0.2).assertTrue();
        expect(rgbaAlpha(Tokens.SHADOW_AMBIENT_E3.color) < 0.2).assertTrue();
      });
      // boundary: radius/offsetY positive, ascending ambient
      it('SHADOW_AMBIENT_* radius and offsetY ascending', 0, () => {
        expect(Tokens.SHADOW_AMBIENT_E0.radius < Tokens.SHADOW_AMBIENT_E1.radius).assertTrue();
        expect(Tokens.SHADOW_AMBIENT_E1.radius < Tokens.SHADOW_AMBIENT_E2.radius).assertTrue();
        expect(Tokens.SHADOW_AMBIENT_E2.radius < Tokens.SHADOW_AMBIENT_E3.radius).assertTrue();
        expect(Tokens.SHADOW_AMBIENT_E0.offsetY < Tokens.SHADOW_AMBIENT_E1.offsetY).assertTrue();
        expect(Tokens.SHADOW_AMBIENT_E1.offsetY < Tokens.SHADOW_AMBIENT_E2.offsetY).assertTrue();
        expect(Tokens.SHADOW_AMBIENT_E2.offsetY < Tokens.SHADOW_AMBIENT_E3.offsetY).assertTrue();
      });
    });

    // ==================== Stroke (Bible §7) ====================
    describe('Stroke', () => {
      it('STROKE_* match Bible §7', 0, () => {
        expect(Tokens.STROKE_HAIRLINE.width).assertEqual(1);
        expect(Tokens.STROKE_HAIRLINE.color).assertEqual('rgba(26,28,32,0.08)');
        expect(Tokens.STROKE_STRONG.width).assertEqual(1);
        expect(Tokens.STROKE_STRONG.color).assertEqual('rgba(26,28,32,0.14)');
      });
      // Bible §2 constraint: stroke alpha < 0.2
      it('STROKE_* alpha < 0.2 (Bible §2 stroke constraint)', 0, () => {
        expect(rgbaAlpha(Tokens.STROKE_HAIRLINE.color) < 0.2).assertTrue();
        expect(rgbaAlpha(Tokens.STROKE_STRONG.color) < 0.2).assertTrue();
      });
      // boundary: STRONG alpha > HAIRLINE alpha
      it('STROKE_STRONG alpha > STROKE_HAIRLINE alpha', 0, () => {
        expect(rgbaAlpha(Tokens.STROKE_STRONG.color) > rgbaAlpha(Tokens.STROKE_HAIRLINE.color)).assertTrue();
      });
    });

    // ==================== Motion Curve (Bible §9) ====================
    describe('MotionCurve', () => {
      it('MOTION_EASE_PHOENIX params + duration + ICurve structure', 0, () => {
        expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.x1).assertEqual(0.32);
        expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.y1).assertEqual(0.72);
        expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.x2).assertEqual(0);
        expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.y2).assertEqual(1);
        expect(Tokens.MOTION_EASE_PHOENIX_DURATION).assertEqual(600);
        expect(Tokens.MOTION_EASE_PHOENIX).assertNotNull();
        expect(typeof Tokens.MOTION_EASE_PHOENIX.interpolate).assertEqual('function');
      });
      it('MOTION_EASE_EMPHASIS params + duration + ICurve structure', 0, () => {
        expect(Tokens.MOTION_EASE_EMPHASIS_PARAMS.x1).assertEqual(0.22);
        expect(Tokens.MOTION_EASE_EMPHASIS_PARAMS.y1).assertEqual(1);
        expect(Tokens.MOTION_EASE_EMPHASIS_PARAMS.x2).assertEqual(0.36);
        expect(Tokens.MOTION_EASE_EMPHASIS_PARAMS.y2).assertEqual(1);
        expect(Tokens.MOTION_EASE_EMPHASIS_DURATION).assertEqual(800);
        expect(Tokens.MOTION_EASE_EMPHASIS).assertNotNull();
        expect(typeof Tokens.MOTION_EASE_EMPHASIS.interpolate).assertEqual('function');
      });
      it('MOTION_EASE_MAGNETIC params + duration + ICurve structure', 0, () => {
        expect(Tokens.MOTION_EASE_MAGNETIC_PARAMS.x1).assertEqual(0.32);
        expect(Tokens.MOTION_EASE_MAGNETIC_PARAMS.y1).assertEqual(0.72);
        expect(Tokens.MOTION_EASE_MAGNETIC_PARAMS.x2).assertEqual(0);
        expect(Tokens.MOTION_EASE_MAGNETIC_PARAMS.y2).assertEqual(1);
        expect(Tokens.MOTION_EASE_MAGNETIC_DURATION).assertEqual(200);
        expect(Tokens.MOTION_EASE_MAGNETIC).assertNotNull();
        expect(typeof Tokens.MOTION_EASE_MAGNETIC.interpolate).assertEqual('function');
      });
      it('MOTION_EASE_SHEET params + duration + ICurve structure', 0, () => {
        expect(Tokens.MOTION_EASE_SHEET_PARAMS.x1).assertEqual(0.16);
        expect(Tokens.MOTION_EASE_SHEET_PARAMS.y1).assertEqual(1);
        expect(Tokens.MOTION_EASE_SHEET_PARAMS.x2).assertEqual(0.3);
        expect(Tokens.MOTION_EASE_SHEET_PARAMS.y2).assertEqual(1);
        expect(Tokens.MOTION_EASE_SHEET_DURATION).assertEqual(400);
        expect(Tokens.MOTION_EASE_SHEET).assertNotNull();
        expect(typeof Tokens.MOTION_EASE_SHEET.interpolate).assertEqual('function');
      });
      it('MOTION_EASE_TAB params + duration + ICurve structure', 0, () => {
        expect(Tokens.MOTION_EASE_TAB_PARAMS.x1).assertEqual(0.32);
        expect(Tokens.MOTION_EASE_TAB_PARAMS.y1).assertEqual(0.72);
        expect(Tokens.MOTION_EASE_TAB_PARAMS.x2).assertEqual(0);
        expect(Tokens.MOTION_EASE_TAB_PARAMS.y2).assertEqual(1);
        expect(Tokens.MOTION_EASE_TAB_DURATION).assertEqual(320);
        expect(Tokens.MOTION_EASE_TAB).assertNotNull();
        expect(typeof Tokens.MOTION_EASE_TAB.interpolate).assertEqual('function');
      });
      // consistency: PHOENIX / MAGNETIC / TAB share the same bezier params (Bible §9)
      it('PHOENIX/MAGNETIC/TAB share identical bezier params', 0, () => {
        expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.x1).assertEqual(Tokens.MOTION_EASE_MAGNETIC_PARAMS.x1);
        expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.y1).assertEqual(Tokens.MOTION_EASE_MAGNETIC_PARAMS.y1);
        expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.x2).assertEqual(Tokens.MOTION_EASE_MAGNETIC_PARAMS.x2);
        expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.y2).assertEqual(Tokens.MOTION_EASE_MAGNETIC_PARAMS.y2);
        expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.x1).assertEqual(Tokens.MOTION_EASE_TAB_PARAMS.x1);
        expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.y1).assertEqual(Tokens.MOTION_EASE_TAB_PARAMS.y1);
        expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.x2).assertEqual(Tokens.MOTION_EASE_TAB_PARAMS.x2);
        expect(Tokens.MOTION_EASE_PHOENIX_PARAMS.y2).assertEqual(Tokens.MOTION_EASE_TAB_PARAMS.y2);
      });
      // boundary: durations positive & distinct where Bible specifies distinct values
      it('MOTION durations are positive', 0, () => {
        expect(Tokens.MOTION_EASE_PHOENIX_DURATION > 0).assertTrue();
        expect(Tokens.MOTION_EASE_EMPHASIS_DURATION > 0).assertTrue();
        expect(Tokens.MOTION_EASE_MAGNETIC_DURATION > 0).assertTrue();
        expect(Tokens.MOTION_EASE_SHEET_DURATION > 0).assertTrue();
        expect(Tokens.MOTION_EASE_TAB_DURATION > 0).assertTrue();
      });
      // boundary: bezier x control points in [0,1] (cubic-bezier domain constraint)
      it('MOTION bezier x1/x2 in [0,1]', 0, () => {
        const params: Tokens.CurveParams[] = [
          Tokens.MOTION_EASE_PHOENIX_PARAMS,
          Tokens.MOTION_EASE_EMPHASIS_PARAMS,
          Tokens.MOTION_EASE_MAGNETIC_PARAMS,
          Tokens.MOTION_EASE_SHEET_PARAMS,
          Tokens.MOTION_EASE_TAB_PARAMS,
        ];
        for (const p of params) {
          expect(p.x1 >= 0 && p.x1 <= 1).assertTrue();
          expect(p.x2 >= 0 && p.x2 <= 1).assertTrue();
        }
      });
      // V-8 explicit: referencing all 5 module-level ICurve consts proves
      // module-level initialization did not throw at import time.
      it('V-8: all 5 module-level ICurve consts initialized (non-null)', 0, () => {
        expect(Tokens.MOTION_EASE_PHOENIX).assertNotNull();
        expect(Tokens.MOTION_EASE_EMPHASIS).assertNotNull();
        expect(Tokens.MOTION_EASE_MAGNETIC).assertNotNull();
        expect(Tokens.MOTION_EASE_SHEET).assertNotNull();
        expect(Tokens.MOTION_EASE_TAB).assertNotNull();
      });
    });
  });
}
