import { describe, it, expect } from 'vitest';
import { NAV } from './nav-config';

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
