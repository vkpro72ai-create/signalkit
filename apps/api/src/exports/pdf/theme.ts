/**
 * PDF design tokens — mirrors the SignalKit flat 2D brand system
 * (apps/mobile/components/brand.tsx `tk.color`) so exported documents read as
 * the same product as the app, not a generic report template. No gradients,
 * no glassmorphism, no neon.
 */

export const COLOR = {
  canvas: '#F4F3EF',
  surface: '#FFFFFF',
  surfaceRaised: '#FAFAF8',

  ink: '#1A1E2B',
  subtle: '#64748B',
  muted: '#94A3B8',
  faint: '#CBD5E1',

  brand: '#1B4332',
  brandMid: '#2D6A4F',
  brandLight: '#D8EFE4',
  brandFaint: '#F0FAF4',

  line: '#E4E7EC',
  lineMid: '#CBD5E1',
  lineStrong: '#94A3B8',

  confidence: '#1B3A66',
  confidenceBg: '#E7EFFA',
  confidenceBorder: '#A9C4E8',

  warning: '#6B4E07',
  warningBg: '#FBF1D9',
  warningBorder: '#E6CE8C',

  risk: '#6A1B1B',
  riskBg: '#FBE9E9',
  riskBorder: '#E2A6A6',

  success: '#14532D',
  successBg: '#DCFCE7',
  successBorder: '#86EFAC',

  white: '#FFFFFF',
} as const;

/** Semantic color for a quality-gate / status word, matching web's colorFor() intent. */
export function statusColor(status: string): { fg: string; bg: string; border: string } {
  const s = status.toLowerCase();
  if (s === 'failed' || s === 'fail') return { fg: COLOR.risk, bg: COLOR.riskBg, border: COLOR.riskBorder };
  if (s === 'warnings' || s === 'warning' || s === 'warn') return { fg: COLOR.warning, bg: COLOR.warningBg, border: COLOR.warningBorder };
  if (s === 'passed' || s === 'pass' || s === 'success') return { fg: COLOR.success, bg: COLOR.successBg, border: COLOR.successBorder };
  return { fg: COLOR.subtle, bg: COLOR.surfaceRaised, border: COLOR.line };
}

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const TYPE = {
  display: 30,
  h1: 20,
  h2: 15,
  h3: 12,
  body: 10,
  small: 9,
  micro: 7.5,
} as const;

export const PAGE = {
  size: 'A4' as const,
  margin: 56,
  footerHeight: 34,
};
