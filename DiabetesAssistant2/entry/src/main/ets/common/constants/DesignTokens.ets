import { curves } from '@kit.ArkUI';

// ==================== Typography (Bible §4) ====================
export interface TypographyToken {
  size: number;
  weight: number;
  lineHeight: number;
  tracking: number;
}

export const TYPO_DISPLAY_XXXL: TypographyToken = { size: 44, weight: 900, lineHeight: 1.02, tracking: -0.6 };
export const TYPO_DISPLAY_L: TypographyToken = { size: 36, weight: 700, lineHeight: 1.05, tracking: -0.5 };
export const TYPO_DISPLAY_M: TypographyToken = { size: 28, weight: 700, lineHeight: 1.10, tracking: -0.4 };
export const TYPO_HEADLINE: TypographyToken = { size: 22, weight: 600, lineHeight: 1.18, tracking: -0.2 };
export const TYPO_TITLE: TypographyToken = { size: 18, weight: 600, lineHeight: 1.25, tracking: 0 };
export const TYPO_SUBTITLE: TypographyToken = { size: 15, weight: 500, lineHeight: 1.30, tracking: 0 };
export const TYPO_BODY: TypographyToken = { size: 14, weight: 400, lineHeight: 1.45, tracking: 0 };
export const TYPO_BODY_STRONG: TypographyToken = { size: 14, weight: 600, lineHeight: 1.40, tracking: 0 };
export const TYPO_LABEL: TypographyToken = { size: 12, weight: 500, lineHeight: 1.20, tracking: 0.4 };
export const TYPO_CAPTION: TypographyToken = { size: 11, weight: 400, lineHeight: 1.30, tracking: 0 };
export const TYPO_EYEBROW: TypographyToken = { size: 10, weight: 500, lineHeight: 1.20, tracking: 1.5 };
export const TYPO_METRIC: TypographyToken = { size: 48, weight: 600, lineHeight: 1.00, tracking: -0.6 };

export const FONT_FAMILY_DISPLAY: string = 'HarmonyOS Sans Display';
export const FONT_FAMILY_BODY: string = 'HarmonyOS Sans';
export const FONT_FAMILY_MONO: string = 'HarmonyOS Sans Mono';

// ==================== Spatial (Bible §5) ====================
export const SPACE_0: number = 0;
export const SPACE_1: number = 4;
export const SPACE_2: number = 8;
export const SPACE_3: number = 12;
export const SPACE_4: number = 16;
export const SPACE_5: number = 20;
export const SPACE_6: number = 24;
export const SPACE_7: number = 32;
export const SPACE_8: number = 40;
export const SPACE_9: number = 56;
export const SPACE_10: number = 72;
export const SPACE_11: number = 96;
export const SPACE_12: number = 128;

// ==================== Radius (Bible §6) ====================
export const RADIUS_PILL: number = 100;
export const RADIUS_HERO: number = 32;
export const RADIUS_CARD_OUTER: number = 28;
export const RADIUS_CARD_INNER: number = 22;
export const RADIUS_CELL: number = 18;
export const RADIUS_MEDIA: number = 16;
export const RADIUS_BUBBLE: number = 20;
export const RADIUS_TAG: number = 12;
export const RADIUS_PILL_MINI: number = 14;

// ==================== Color — Neutral Inks (Bible §7) ====================
export const COLOR_INK_900: string = '#1A1C20';
export const COLOR_INK_800: string = '#25272B';
export const COLOR_INK_700: string = '#3A3D43';
export const COLOR_INK_600: string = '#5A5D63';
export const COLOR_INK_500: string = '#7A7E85';
export const COLOR_INK_400: string = '#A0A3A8';
export const COLOR_INK_300: string = '#C5C8CC';
export const COLOR_INK_200: string = '#E5E7E9';
export const COLOR_INK_100: string = '#F2F3F4';

// ==================== Color — Warm Cream Surfaces (Bible §7) ====================
export const COLOR_PAPER_50: string = '#FAF9F6';
export const COLOR_PAPER_100: string = '#F5F3EE';
export const COLOR_PAPER_200: string = '#EDE9E0';

// ==================== Color — Signature Accent (Bible §7) ====================
export const COLOR_ACCENT_SAGE_600: string = '#3E5641';
export const COLOR_ACCENT_SAGE_500: string = '#4F7052';
export const COLOR_ACCENT_SAGE_300: string = '#A7C0A8';
export const COLOR_ACCENT_CLAY_600: string = '#8E5447';
export const COLOR_ACCENT_CLAY_500: string = '#B26953';
export const COLOR_ACCENT_CLAY_300: string = '#D4A48E';
export const COLOR_ACCENT_MIST_500: string = '#63747D';
export const COLOR_ACCENT_SAND_500: string = '#D5C6A1';

// ==================== Color — Functional Accents (Bible §7) ====================
export const COLOR_SUCCESS_600: string = '#4F7052';
export const COLOR_WARN_600: string = '#B4824A';
export const COLOR_DANGER_600: string = '#9B5151';
export const COLOR_INFO_500: string = '#63747D';

// ==================== Shadow (Bible §7) ====================
export interface ShadowToken {
  radius: number;
  color: string;
  offsetY: number;
}

export const SHADOW_AMBIENT_E0: ShadowToken = { color: 'rgba(24,24,24,0.04)', radius: 16, offsetY: 4 };
export const SHADOW_AMBIENT_E1: ShadowToken = { color: 'rgba(24,24,24,0.05)', radius: 24, offsetY: 6 };
export const SHADOW_AMBIENT_E2: ShadowToken = { color: 'rgba(24,24,24,0.06)', radius: 36, offsetY: 12 };
export const SHADOW_AMBIENT_E3: ShadowToken = { color: 'rgba(24,24,24,0.08)', radius: 48, offsetY: 20 };

// ==================== Stroke (Bible §7) ====================
export interface StrokeToken {
  width: number;
  color: string;
}

export const STROKE_HAIRLINE: StrokeToken = { width: 1, color: 'rgba(26,28,32,0.08)' };
export const STROKE_STRONG: StrokeToken = { width: 1, color: 'rgba(26,28,32,0.14)' };

// ==================== Motion Curve (Bible §9) ====================
export interface CurveParams {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const MOTION_EASE_PHOENIX_PARAMS: CurveParams = { x1: 0.32, y1: 0.72, x2: 0, y2: 1 };
export const MOTION_EASE_PHOENIX = curves.cubicBezierCurve(
  MOTION_EASE_PHOENIX_PARAMS.x1, MOTION_EASE_PHOENIX_PARAMS.y1,
  MOTION_EASE_PHOENIX_PARAMS.x2, MOTION_EASE_PHOENIX_PARAMS.y2);
export const MOTION_EASE_PHOENIX_DURATION: number = 600;

export const MOTION_EASE_EMPHASIS_PARAMS: CurveParams = { x1: 0.22, y1: 1, x2: 0.36, y2: 1 };
export const MOTION_EASE_EMPHASIS = curves.cubicBezierCurve(
  MOTION_EASE_EMPHASIS_PARAMS.x1, MOTION_EASE_EMPHASIS_PARAMS.y1,
  MOTION_EASE_EMPHASIS_PARAMS.x2, MOTION_EASE_EMPHASIS_PARAMS.y2);
export const MOTION_EASE_EMPHASIS_DURATION: number = 800;

export const MOTION_EASE_MAGNETIC_PARAMS: CurveParams = { x1: 0.32, y1: 0.72, x2: 0, y2: 1 };
export const MOTION_EASE_MAGNETIC = curves.cubicBezierCurve(
  MOTION_EASE_MAGNETIC_PARAMS.x1, MOTION_EASE_MAGNETIC_PARAMS.y1,
  MOTION_EASE_MAGNETIC_PARAMS.x2, MOTION_EASE_MAGNETIC_PARAMS.y2);
export const MOTION_EASE_MAGNETIC_DURATION: number = 200;

export const MOTION_EASE_SHEET_PARAMS: CurveParams = { x1: 0.16, y1: 1, x2: 0.3, y2: 1 };
export const MOTION_EASE_SHEET = curves.cubicBezierCurve(
  MOTION_EASE_SHEET_PARAMS.x1, MOTION_EASE_SHEET_PARAMS.y1,
  MOTION_EASE_SHEET_PARAMS.x2, MOTION_EASE_SHEET_PARAMS.y2);
export const MOTION_EASE_SHEET_DURATION: number = 400;

export const MOTION_EASE_TAB_PARAMS: CurveParams = { x1: 0.32, y1: 0.72, x2: 0, y2: 1 };
export const MOTION_EASE_TAB = curves.cubicBezierCurve(
  MOTION_EASE_TAB_PARAMS.x1, MOTION_EASE_TAB_PARAMS.y1,
  MOTION_EASE_TAB_PARAMS.x2, MOTION_EASE_TAB_PARAMS.y2);
export const MOTION_EASE_TAB_DURATION: number = 320;
