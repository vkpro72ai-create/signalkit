import type { Route } from 'next';
import type { MessageKey } from '@signalkit/i18n';

/**
 * Primary navigation — product sections only. Design System is an internal
 * dev route and is intentionally NOT listed here (reachable by direct URL).
 * Evidence/Sources is intentionally NOT here — evidence lives contextually
 * inside Opportunity / Pack / Project (see components/evidence-panel.tsx).
 */
export const NAV: { href: Route; key: MessageKey }[] = [
  { href: '/signalkit', key: 'nav.home' },
  { href: '/signalkit/research', key: 'nav.research' },
  { href: '/signalkit/opportunities', key: 'nav.opportunities' },
  { href: '/signalkit/packs', key: 'nav.packs' },
  { href: '/signalkit/projects', key: 'nav.projects' },
  { href: '/signalkit/exports', key: 'nav.exports' },
  { href: '/signalkit/settings/llm', key: 'nav.aiEngine' },
  { href: '/signalkit/settings/language', key: 'nav.language' },
  { href: '/signalkit/settings/account', key: 'nav.account' },
];
