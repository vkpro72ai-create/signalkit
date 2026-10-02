import type { Route } from 'next';
import type { MessageKey } from '@signalkit/i18n';

/**
 * Primary navigation — product sections only. Design System is an internal
 * dev route and is intentionally NOT listed here (reachable by direct URL).
 * Evidence/Sources is intentionally NOT here — evidence lives contextually
 * inside Opportunity / Pack / Project (see components/evidence-panel.tsx).
 */
export interface NavItem {
  href: Route;
  key: MessageKey;
}

export interface NavGroup {
  key: MessageKey;
  items: NavItem[];
}

export const NAV_HOME: NavItem = { href: '/signalkit', key: 'nav.home' };

/**
 * Grouped sidebar structure: Opportunities (search + shortlist) -> Projects
 * (committed projects, their document packs, and exports) -> Settings
 * (workspace-level config). Mirrors the actual pipeline stages instead of a
 * flat, undifferentiated list.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'nav.group.opportunities',
    items: [
      { href: '/signalkit/research', key: 'nav.research' },
      { href: '/signalkit/opportunities', key: 'nav.opportunities' },
    ],
  },
  {
    key: 'nav.group.projects',
    items: [
      { href: '/signalkit/projects', key: 'nav.projects' },
      { href: '/signalkit/packs', key: 'nav.packs' },
      { href: '/signalkit/exports', key: 'nav.exports' },
    ],
  },
  {
    key: 'nav.group.settings',
    items: [
      { href: '/signalkit/settings/llm', key: 'nav.aiEngine' },
      { href: '/signalkit/settings/language', key: 'nav.language' },
      { href: '/signalkit/settings/account', key: 'nav.account' },
    ],
  },
];

/** Flat view of every nav item (Home + all group items), in display order. */
export const NAV: NavItem[] = [NAV_HOME, ...NAV_GROUPS.flatMap((group) => group.items)];
