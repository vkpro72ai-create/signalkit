/**
 * Design tokens — premium flat 2D system.
 *
 * UI/UX law (docs/UI_UX_PRINCIPLES.md): no gradients, no glassmorphism, no neon
 * glow, no 3D. Colors are flat solids only. The catalog of semantic colors below
 * is the single source of truth shared by web and mobile.
 */

/** Semantic color roles used across the product. */
export type SemanticColor =
  | 'opportunity'
  | 'confidence'
  | 'risk'
  | 'evidence'
  | 'warning'
  | 'success'
  | 'draft'
  | 'ready'
  | 'failed'
  | 'muted';

/** A flat color pair (foreground + background) for light & dark surfaces. */
export interface FlatColor {
  /** Solid hex. Gradients are intentionally impossible to express here. */
  fg: string;
  bg: string;
  border: string;
}

export const semanticColorsLight: Record<SemanticColor, FlatColor> = {
  opportunity: { fg: '#0B3D2E', bg: '#E6F4EE', border: '#9FD3BE' },
  confidence: { fg: '#1B3A66', bg: '#E7EFFA', border: '#A9C4E8' },
  risk: { fg: '#6A1B1B', bg: '#FBE9E9', border: '#E2A6A6' },
  evidence: { fg: '#3A2E5C', bg: '#EEE9F7', border: '#C3B4E0' },
  warning: { fg: '#6B4E07', bg: '#FBF1D9', border: '#E6CE8C' },
  success: { fg: '#13502B', bg: '#E4F5E9', border: '#9DD6AE' },
  draft: { fg: '#3F4651', bg: '#EEF1F4', border: '#C7CDD6' },
  ready: { fg: '#0B3D2E', bg: '#E6F4EE', border: '#9FD3BE' },
  failed: { fg: '#6A1B1B', bg: '#FBE9E9', border: '#E2A6A6' },
  muted: { fg: '#5A626E', bg: '#F4F6F8', border: '#DDE2E8' },
};

export const semanticColorsDark: Record<SemanticColor, FlatColor> = {
  opportunity: { fg: '#BFE8D6', bg: '#11271F', border: '#2E5345' },
  confidence: { fg: '#BAD3F2', bg: '#142337', border: '#2C4669' },
  risk: { fg: '#F2B8B8', bg: '#2C1515', border: '#5A2A2A' },
  evidence: { fg: '#D6C9F0', bg: '#1F1830', border: '#41335E' },
  warning: { fg: '#EAD08A', bg: '#2A2310', border: '#54461F' },
  success: { fg: '#A9DEBC', bg: '#11271A', border: '#2C5238' },
  draft: { fg: '#C7CDD6', bg: '#1B1F24', border: '#333A43' },
  ready: { fg: '#BFE8D6', bg: '#11271F', border: '#2E5345' },
  failed: { fg: '#F2B8B8', bg: '#2C1515', border: '#5A2A2A' },
  muted: { fg: '#9AA2AD', bg: '#1A1D22', border: '#2E333A' },
};

/** Spacing scale (px), 4pt grid. */
export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

/** Corner radii (px) — restrained, no pill-everything. */
export const radius = {
  none: 0,
  sm: 4,
  md: 6,
  lg: 10,
  full: 9999,
} as const;

/** Border widths (px). */
export const border = {
  hairline: 1,
  thick: 2,
} as const;

/** Typographic scale (px) and weights — strong, editorial hierarchy. */
export const typography = {
  fontFamily: {
    sans: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
  },
  size: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 22,
    '2xl': 28,
    '3xl': 36,
    '4xl': 48,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const;
