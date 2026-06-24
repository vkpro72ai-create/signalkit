import { REQUIRED_DOCUMENT_TYPES, type ProductPackDepth } from '@signalkit/shared';
import { spacing, semanticColorsLight } from '@signalkit/ui';

/**
 * Session 1 placeholder home. Proves the web app boots and consumes the shared
 * contracts + UI tokens. The real workspace pipeline UI (Projects → Market →
 * Sources → Niches → Evidence → Score → Pack → Export) arrives in Session 3.
 */
const depths: ProductPackDepth[] = [
  'quick_opportunity',
  'build_ready',
  'investor_grade',
  'agency_client',
  'ai_agent_engineering',
];

export default function HomePage() {
  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: spacing['3xl'] }}>
      <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: spacing.sm }}>SignalKit</h1>
      <p style={{ color: semanticColorsLight.muted.fg, marginTop: 0 }}>
        Evidence-backed market opportunity discovery and build-ready Product Document Packs.
      </p>

      <section style={{ marginTop: spacing['2xl'] }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Pack depths</h2>
        <ul>
          {depths.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: spacing['2xl'] }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>
          Documents per full pack: {REQUIRED_DOCUMENT_TYPES.length}
        </h2>
      </section>
    </main>
  );
}
