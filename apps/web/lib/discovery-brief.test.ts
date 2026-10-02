import { describe, it, expect } from 'vitest';
import {
  briefFieldComplete,
  missingBriefFields,
  briefCompletedCount,
  isBriefComplete,
  resolveActiveProjectId,
  type BriefValues,
} from './discovery-brief';

const empty: BriefValues = { direction: '', audienceInput: '', productFormat: '' };
const full: BriefValues = { direction: 'AI / Automation', audienceInput: 'SMB owners', productFormat: 'saas' };

describe('discovery-brief completeness', () => {
  it('treats a fresh (empty) brief as fully incomplete', () => {
    expect(missingBriefFields(empty)).toEqual(['topic', 'audience', 'productType']);
    expect(briefCompletedCount(empty)).toBe(0);
    expect(isBriefComplete(empty)).toBe(false);
  });

  it('treats "Any direction" / "Any format" (empty string) as not completed, not as a valid selection', () => {
    const values: BriefValues = { direction: '', audienceInput: 'SMB owners', productFormat: '' };
    expect(briefFieldComplete('topic', values)).toBe(false);
    expect(briefFieldComplete('productType', values)).toBe(false);
    expect(missingBriefFields(values)).toEqual(['topic', 'productType']);
  });

  it('treats whitespace-only audience as not completed', () => {
    const values: BriefValues = { direction: 'AI', audienceInput: '   ', productFormat: 'saas' };
    expect(briefFieldComplete('audience', values)).toBe(false);
  });

  it('updates the completion count as fields are filled one at a time', () => {
    expect(briefCompletedCount({ direction: 'AI', audienceInput: '', productFormat: '' })).toBe(1);
    expect(briefCompletedCount({ direction: 'AI', audienceInput: 'SMB', productFormat: '' })).toBe(2);
    expect(briefCompletedCount({ direction: 'AI', audienceInput: 'SMB', productFormat: 'saas' })).toBe(3);
  });

  it('is complete only once topic, audience, and product type are all filled', () => {
    expect(isBriefComplete(full)).toBe(true);
    expect(missingBriefFields(full)).toEqual([]);
  });
});

describe('resolveActiveProjectId — exact Research scoping', () => {
  const projects = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];

  it('honors an explicit ?project= id over the first project in the list', () => {
    expect(resolveActiveProjectId(projects, 'p3')).toBe('p3');
  });

  it('never shows opportunities from another Research when a fresh search is requested by id', () => {
    // A brand-new Opportunity Search created after p1/p2 must land on ITSELF,
    // not silently fall back to whichever project happens to be first.
    expect(resolveActiveProjectId(projects, 'p2')).not.toBe(projects[0]!.id);
  });

  it('falls back to the first project only when no id was requested', () => {
    expect(resolveActiveProjectId(projects, null)).toBe('p1');
  });

  it('falls back to the first project if the requested id does not exist in this workspace', () => {
    expect(resolveActiveProjectId(projects, 'does-not-exist')).toBe('p1');
  });

  it('returns null when there are no projects at all', () => {
    expect(resolveActiveProjectId([], null)).toBeNull();
  });

  it('skips an archived (promoted/finished) search when picking the fallback, landing on the newest one still in progress', () => {
    const withArchived = [{ id: 'p1', status: 'archived' }, { id: 'p2', status: 'active' }, { id: 'p3', status: 'draft' }];
    expect(resolveActiveProjectId(withArchived, null)).toBe('p2');
  });

  it('still honors an explicit id even if that search is archived', () => {
    const withArchived = [{ id: 'p1', status: 'archived' }, { id: 'p2', status: 'active' }];
    expect(resolveActiveProjectId(withArchived, 'p1')).toBe('p1');
  });

  it('falls back to the first project (even archived) if every project is archived', () => {
    const allArchived = [{ id: 'p1', status: 'archived' }, { id: 'p2', status: 'archived' }];
    expect(resolveActiveProjectId(allArchived, null)).toBe('p1');
  });
});
