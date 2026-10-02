import { describe, it, expect } from 'vitest';
import { canPromote } from './promotion';

describe('canPromote — promotion-eligibility guard', () => {
  it('refuses when not build-ready, even with full founder commitment', () => {
    expect(canPromote({ buildReady: false, commitmentConfirmed: true, reviewedRisks: true })).toBe(false);
  });

  it('refuses when build-ready but commitment is missing', () => {
    expect(canPromote({ buildReady: true, commitmentConfirmed: false, reviewedRisks: true })).toBe(false);
  });

  it('refuses when build-ready but risks were not reviewed', () => {
    expect(canPromote({ buildReady: true, commitmentConfirmed: true, reviewedRisks: false })).toBe(false);
  });

  it('allows promotion only when build-ready AND fully committed', () => {
    expect(canPromote({ buildReady: true, commitmentConfirmed: true, reviewedRisks: true })).toBe(true);
  });
});
