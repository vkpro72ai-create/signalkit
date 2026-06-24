/**
 * @signalkit/ui — design tokens and (from Session 3) shared UI primitives.
 *
 * Session 1 ships the token layer only, so web/mobile share one flat 2D design
 * language from day one. React components (AppShell, badges, Card, Table, ...)
 * are added in Session 3 against these tokens.
 */
export * from './tokens.js';

/** Guard used by tests/lint helpers to assert no gradient strings leak into theme values. */
export function assertNoGradient(value: string): void {
  if (/gradient/i.test(value)) {
    throw new Error(`UI law violation: gradients are not allowed ("${value}")`);
  }
}
