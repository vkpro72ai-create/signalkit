import { describe, it, expect } from 'vitest';
import { NAV, NAV_HOME, NAV_GROUPS } from './nav-config';

describe('primary navigation invariants', () => {
  it('does not list Sources/Evidence as a top-level nav item', () => {
    expect(NAV.some((item) => item.key === 'nav.sources')).toBe(false);
  });

  it('renames the research/search container to "Opportunity Search" (not "Projects")', () => {
    expect(NAV.some((item) => item.href === '/signalkit/research' && item.key === 'nav.research')).toBe(true);
  });

  it('"Projects" now points at implementation projects, not research contexts', () => {
    const projectsItem = NAV.find((item) => item.key === 'nav.projects');
    expect(projectsItem?.href).toBe('/signalkit/projects');
  });

  it('includes Opportunities and Product Packs', () => {
    expect(NAV.some((item) => item.key === 'nav.opportunities')).toBe(true);
    expect(NAV.some((item) => item.key === 'nav.packs')).toBe(true);
  });

  it('has no duplicate hrefs', () => {
    const hrefs = NAV.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe('grouped sidebar structure', () => {
  it('groups Opportunity Search + Opportunities under one "Opportunities" group', () => {
    const group = NAV_GROUPS.find((g) => g.key === 'nav.group.opportunities');
    expect(group?.items.map((i) => i.key)).toEqual(['nav.research', 'nav.opportunities']);
  });

  it('groups Projects + Product Packs + Exports under one "Projects" group', () => {
    const group = NAV_GROUPS.find((g) => g.key === 'nav.group.projects');
    expect(group?.items.map((i) => i.key)).toEqual(['nav.projects', 'nav.packs', 'nav.exports']);
  });

  it('groups AI Engine + Language + Account under one "Settings" group', () => {
    const group = NAV_GROUPS.find((g) => g.key === 'nav.group.settings');
    expect(group?.items.map((i) => i.key)).toEqual(['nav.aiEngine', 'nav.language', 'nav.account']);
  });

  it('Home stays outside every group, and NAV is exactly Home followed by every group item in order', () => {
    expect(NAV_HOME.key).toBe('nav.home');
    expect(NAV[0]).toEqual(NAV_HOME);
    expect(NAV.slice(1)).toEqual(NAV_GROUPS.flatMap((g) => g.items));
  });
});
