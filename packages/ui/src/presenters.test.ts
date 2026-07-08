import { describe, it, expect } from 'vitest';
import {
  scoreVariant,
  riskVariant,
  confidenceVariant,
  documentStatusVariant,
  costVariant,
  colorFor,
  assertNoGradient,
} from './index.js';

describe('@signalkit/ui presenters', () => {
  it('maps scores to opportunity → muted bands', () => {
    expect(scoreVariant(90).variant).toBe('opportunity');
    expect(scoreVariant(60).variant).toBe('confidence');
    expect(scoreVariant(30).variant).toBe('warning');
    expect(scoreVariant(10).variant).toBe('muted');
    expect(scoreVariant(150).variant).toBe('opportunity'); // clamped
  });

  it('maps risk and confidence consistently', () => {
    expect(riskVariant('low')).toBe('success');
    expect(riskVariant('high')).toBe('risk');
    expect(confidenceVariant('very_high')).toBe('confidence');
    expect(confidenceVariant('low')).toBe('risk');
  });

  it('maps document status to pill variants', () => {
    expect(documentStatusVariant('approved')).toBe('ready');
    expect(documentStatusVariant('failed')).toBe('failed');
    expect(documentStatusVariant('draft')).toBe('draft');
  });

  it('flags expensive generations', () => {
    expect(costVariant(0.2)).toBe('muted');
    expect(costVariant(2)).toBe('warning');
    expect(costVariant(8)).toBe('risk');
  });

  it('resolves flat colors for both themes without gradients', () => {
    const light = colorFor('opportunity', 'light');
    const dark = colorFor('opportunity', 'dark');
    expect(light.bg).not.toEqual(dark.bg);
    expect(() => assertNoGradient(light.bg)).not.toThrow();
  });
});
