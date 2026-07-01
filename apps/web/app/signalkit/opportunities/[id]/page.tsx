'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { spacing, typography, border } from '@signalkit/ui';
import type { ConfidenceLevel, RiskLevel } from '@signalkit/shared';
import {
  Card,
  PageHeader,
  Tabs,
  Table,
  Badge,
  Button,
  ScoreBadge,
  ConfidenceBadge,
  RiskBadge,
  LoadingState,
  ErrorState,
  palette,
} from '../../../../components/ui';
import { EvidencePanel } from '../../../../components/evidence-panel';
import { useT } from '../../../../lib/i18n';
import { apiGet, apiPost, firstWorkspaceId, packListApi, type PackListItem } from '../../../../lib/api';

interface Dim { dimension: string; score: number; weight: number; explanation: string; assumptionBased: boolean }
interface NicheDetail {
  id: string; projectId: string; title: string; oneLiner: string; problem: string; targetAudience: string;
  whyNow: string; useCases: string[]; competitors: string[]; monetization: string; mvpConcept: string; riskLevel: RiskLevel;
  scores: { totalScore: number; confidenceValue: number; confidenceLevel: string; explanation: string; breakdown: Dim[]; riskPenalties: { reason: string; penalty: number }[] }[];
}
interface Scenarios { scenarios: { kind: string; opportunity: number; note: string }[]; whatMustBeTrue: string[]; goNoGoQuestions: string[] }
interface ThesisSection { text: string; assumption: boolean }
interface VentureScaleDim { dimension: string; score: number; reasoning: string; assumptionBased: boolean; confidence: number }
interface VentureThesisRow {
  ventureScaleScore: number; ventureScaleConfidence: number; ventureScaleLevel: string;
  ventureScaleBreakdown: VentureScaleDim[]; whatMustBeTrue: string[];
  thesis: {
    breakoutThesis: string; whyNow: ThesisSection; macroShifts: string[]; entryWedge: ThesisSection; expansionPath: ThesisSection;
    targetCustomer: string; painEconomics: ThesisSection; alternatives: string[]; aiUnlock: ThesisSection; distributionWedge: ThesisSection;
    dataWorkflowMoat: ThesisSection; monetizationPath: string; marketConstraints: string; ventureScaleNarrative: ThesisSection;
    killReasons: string[]; whatMustBeTrue: string[]; firstValidationExperiments: string[]; assumptions: string[]; unresolvedQuestions: string[];
    evidenceConfidence: { value: number; level: string };
  };
}
interface MarketCompare {
  markets: { country: string; overall: number; marketReadiness: number; willingnessToPay: number; competition: number; regulatoryRisk: number }[];
  firstMarketRecommendation: string | null; marketToAvoid: string | null;
}

export default function NicheDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const router = useRouter();
  const [ws, setWs] = useState<string | null>(null);
  const [niche, setNiche] = useState<NicheDetail | null>(null);
  const [scenarios, setScenarios] = useState<Scenarios | null>(null);
  const [venture, setVenture] = useState<VentureThesisRow | null>(null);
  const [markets, setMarkets] = useState<MarketCompare | null>(null);
  const [packs, setPacks] = useState<PackListItem[]>([]);
  const [tab, setTab] = useState('overview');
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const workspaceId = await firstWorkspaceId();
        setWs(workspaceId);
        if (!workspaceId) return setState('error');
        setNiche(await apiGet<NicheDetail>(`/workspaces/${workspaceId}/niches/${id}`));
        setScenarios(await apiGet<Scenarios>(`/workspaces/${workspaceId}/niches/${id}/scenarios`).catch(() => null));
        setVenture(await apiGet<VentureThesisRow>(`/workspaces/${workspaceId}/niches/${id}/venture-thesis`).catch(() => null));
        setPacks(await packListApi.listForNiche(workspaceId, id).catch(() => []));
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [id]);

  async function compare() {
    if (!ws) return;
    setMarkets(await apiPost<MarketCompare>(`/workspaces/${ws}/niches/${id}/compare-markets`, {}));
  }

  async function generateVentureThesis() {
    if (!ws) return;
    setBusy(true);
    try {
      setVenture(await apiPost<VentureThesisRow>(`/workspaces/${ws}/niches/${id}/venture-thesis/regenerate`));
      setTab('venture');
    } finally {
      setBusy(false);
    }
  }

  async function generateProductPack() {
    if (!ws) return;
    setBusy(true);
    try {
      const res = await apiPost<{ pack: { id: string } }>(`/workspaces/${ws}/niches/${id}/generate-pack`, { depth: 'build_ready', vertical: 'b2b_saas' });
      router.push(`/signalkit/packs/${res.pack.id}`);
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <LoadingState label={t('state.loading')} />;
  if (state === 'error' || !niche) return <ErrorState title={t('state.error.title')} body={t('state.error.body')} />;
  const score = niche.scores[0];

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader
        title={niche.title}
        subtitle={niche.oneLiner}
        action={
          <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center', flexWrap: 'wrap' }}>
            {score ? <ScoreBadge score={score.totalScore} label={t('label.score')} /> : null}
            {score ? <ConfidenceBadge level={score.confidenceLevel as ConfidenceLevel} label={t('label.confidence')} /> : null}
            <RiskBadge level={niche.riskLevel} label={t('label.risk')} />
            <Button variant="secondary" onClick={() => (venture ? setTab('venture') : void generateVentureThesis())} disabled={busy}>
              {venture ? 'Open Venture Thesis' : 'Generate Venture Thesis'}
            </Button>
            {packs[0] ? (
              <Link href={`/signalkit/packs/${packs[0].id}`} style={{ textDecoration: 'none' }}>
                <Button>Open Product Pack</Button>
              </Link>
            ) : (
              <Button onClick={() => void generateProductPack()} disabled={busy}>
                {busy ? 'Generating…' : 'Generate Product Pack'}
              </Button>
            )}
          </div>
        }
      />

      {score ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <p style={{ margin: 0, fontSize: typography.size.sm }}>{score.explanation}</p>
        </Card>
      ) : null}

      <Tabs
        tabs={[
          { key: 'overview', label: 'Founder verdict' },
          { key: 'score', label: t('pipeline.score') },
          { key: 'venture', label: 'Venture Thesis' },
          { key: 'markets', label: t('market.compare') },
          { key: 'evidence', label: t('label.evidence') },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div style={{ marginTop: spacing.lg }}>
        {tab === 'overview' && (
          <Card>
            <Field label="User pain" value={niche.problem} />
            <Field label="Target audience" value={niche.targetAudience} />
            <Field label="Why now" value={niche.whyNow} />
            <Field label="Market wedge" value={venture?.thesis.entryWedge.text ?? '—'} />
            <Field label="Product wedge" value={niche.mvpConcept} />
            <Field label="Monetization" value={niche.monetization} />
            {niche.competitors.length ? <Field label="Competitors" value={niche.competitors.join('; ')} /> : null}
          </Card>
        )}

        {tab === 'score' && score && (
          <>
            <div style={{ display: 'flex', gap: spacing.lg, marginBottom: spacing.lg }}>
              <Card style={{ flex: 1 }}>
                <div style={{ color: palette.subtle, fontSize: typography.size.xs }}>Opportunity</div>
                <div style={{ fontSize: typography.size['2xl'], fontWeight: typography.weight.bold }}>{score.totalScore}/100</div>
              </Card>
              <Card style={{ flex: 1 }}>
                <div style={{ color: palette.subtle, fontSize: typography.size.xs }}>Confidence (separate)</div>
                <div style={{ fontSize: typography.size['2xl'], fontWeight: typography.weight.bold }}>{Math.round(score.confidenceValue * 100)}%</div>
              </Card>
            </div>
            {score.riskPenalties.length ? (
              <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.md, flexWrap: 'wrap' }}>
                {score.riskPenalties.map((p, i) => (
                  <Badge key={i} variant="risk">−{p.penalty} {p.reason}</Badge>
                ))}
              </div>
            ) : null}
            <Table
              columns={[
                { key: 'd', header: 'Dimension', render: (b: Dim) => b.dimension.replace(/_/g, ' ') },
                { key: 's', header: 'Score', render: (b) => String(b.score) },
                { key: 'w', header: 'Weight', render: (b) => b.weight.toFixed(2) },
                { key: 'g', header: '', render: (b) => (b.assumptionBased ? <Badge variant="warning">assumption</Badge> : <Badge variant="evidence">evidence</Badge>) },
                { key: 'e', header: 'Why', render: (b) => <span style={{ color: palette.subtle, fontSize: typography.size.xs }}>{b.explanation}</span> },
              ]}
              rows={score.breakdown}
            />
            {scenarios ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: spacing.md, marginTop: spacing.lg }}>
                {scenarios.scenarios.map((s) => (
                  <Card key={s.kind}>
                    <div style={{ textTransform: 'capitalize', fontWeight: typography.weight.semibold }}>{s.kind}</div>
                    <div style={{ fontSize: typography.size.xl }}>{s.opportunity}/100</div>
                    <div style={{ color: palette.subtle, fontSize: typography.size.xs }}>{s.note}</div>
                  </Card>
                ))}
              </div>
            ) : null}
          </>
        )}

        {tab === 'venture' && (
          venture ? (
            <>
              {/* Four scores, kept strictly separate. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: spacing.md, marginBottom: spacing.lg }}>
                <ScoreCard label="Opportunity" value={score ? `${score.totalScore}/100` : 'n/a'} hint="Good opportunity?" />
                <ScoreCard label="Confidence" value={score ? `${Math.round(score.confidenceValue * 100)}%` : 'n/a'} hint="How supported?" />
                <ScoreCard label="Venture scale" value={`${venture.ventureScaleScore}/100`} hint="Could it be large?" />
                <ScoreCard label="Venture confidence" value={`${Math.round(venture.ventureScaleConfidence * 100)}%`} hint="Evidence coverage" />
              </div>

              <Card style={{ marginBottom: spacing.lg }}>
                <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>Founder verdict</h2>
                <p style={{ margin: 0, fontSize: typography.size.sm }}>{venture.thesis.breakoutThesis}</p>
              </Card>

              <Card style={{ marginBottom: spacing.lg }}>
                <Field label="Why now" value={venture.thesis.whyNow.text} />
                <Field label="User pain economics" value={venture.thesis.painEconomics.text} />
                <Field label="Target customer" value={venture.thesis.targetCustomer} />
                <SecField label="Market wedge" s={venture.thesis.entryWedge} />
                <SecField label="Expansion path" s={venture.thesis.expansionPath} />
                <SecField label="AI unlock (product wedge)" s={venture.thesis.aiUnlock} />
                <SecField label="Distribution wedge" s={venture.thesis.distributionWedge} />
                <SecField label="Data / workflow moat" s={venture.thesis.dataWorkflowMoat} />
                <Field label="Monetization" value={venture.thesis.monetizationPath} />
                <Field label="Market constraints" value={venture.thesis.marketConstraints} />
              </Card>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg, marginBottom: spacing.lg }}>
                <ListCard title="Risks" items={venture.thesis.killReasons} variant="risk" />
                <ListCard title="What must be true" items={venture.whatMustBeTrue.length ? venture.whatMustBeTrue : venture.thesis.whatMustBeTrue} variant="warning" />
                <ListCard title="Validation plan" items={venture.thesis.firstValidationExperiments} variant="evidence" />
                <ListCard title="Assumptions (not facts)" items={venture.thesis.assumptions} variant="warning" />
              </div>

              <Card>
                <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>Venture scale dimensions</h2>
                <Table
                  columns={[
                    { key: 'd', header: 'Dimension', render: (b: VentureScaleDim) => b.dimension.replace(/_/g, ' ') },
                    { key: 's', header: 'Score', render: (b) => String(b.score) },
                    { key: 'g', header: '', render: (b) => (b.assumptionBased ? <Badge variant="warning">assumption</Badge> : <Badge variant="evidence">evidence</Badge>) },
                    { key: 'r', header: 'Reasoning', render: (b) => <span style={{ color: palette.subtle, fontSize: typography.size.xs }}>{b.reasoning}</span> },
                  ]}
                  rows={venture.ventureScaleBreakdown}
                />
                <p style={{ color: palette.subtle, fontSize: typography.size.xs, marginBottom: 0 }}>
                  Venture scale is potential, not a guarantee. No fabricated TAM — weak market size stays an assumption.
                </p>
              </Card>
            </>
          ) : (
            <Card>
              <p style={{ color: palette.subtle, fontSize: typography.size.sm, margin: 0 }}>
                No venture thesis yet. Rescore the niche to generate the Breakout Opportunity analysis.
              </p>
            </Card>
          )
        )}

        {tab === 'markets' && (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <h2 style={{ fontSize: typography.size.lg, margin: 0 }}>{t('market.compare')}</h2>
              <Button variant="secondary" onClick={() => void compare()}>Compare markets</Button>
            </div>
            {markets && markets.markets.length ? (
              <>
                <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.md }}>
                  {markets.firstMarketRecommendation ? <Badge variant="success">First: {markets.firstMarketRecommendation}</Badge> : null}
                  {markets.marketToAvoid ? <Badge variant="risk">Avoid: {markets.marketToAvoid}</Badge> : null}
                </div>
                <Table
                  columns={[
                    { key: 'c', header: 'Market', render: (m: MarketCompare['markets'][number]) => m.country },
                    { key: 'o', header: 'Overall', render: (m) => String(m.overall) },
                    { key: 'r', header: 'Readiness', render: (m) => String(m.marketReadiness) },
                    { key: 'w', header: 'WTP', render: (m) => String(m.willingnessToPay) },
                    { key: 'x', header: 'Competition', render: (m) => String(m.competition) },
                    { key: 'g', header: 'Reg. risk', render: (m) => String(m.regulatoryRisk) },
                  ]}
                  rows={markets.markets}
                />
              </>
            ) : (
              <p style={{ color: palette.subtle, fontSize: typography.size.sm }}>
                Set multiple target markets on the project (Compare several markets) and run a comparison.
              </p>
            )}
          </Card>
        )}

        {tab === 'evidence' && ws && <EvidencePanel ws={ws} projectId={niche.projectId} />}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: `${spacing.sm}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
      <div style={{ color: palette.subtle, fontSize: typography.size.xs }}>{label}</div>
      <div style={{ fontSize: typography.size.sm }}>{value}</div>
    </div>
  );
}

function SecField({ label, s }: { label: string; s: ThesisSection }) {
  return (
    <div style={{ padding: `${spacing.sm}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
      <div style={{ color: palette.subtle, fontSize: typography.size.xs, display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
        {label}{s.assumption ? <Badge variant="warning">assumption</Badge> : <Badge variant="evidence">evidence</Badge>}
      </div>
      <div style={{ fontSize: typography.size.sm }}>{s.text}</div>
    </div>
  );
}

function ScoreCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <div style={{ color: palette.subtle, fontSize: typography.size.xs }}>{label}</div>
      <div style={{ fontSize: typography.size.xl, fontWeight: typography.weight.bold }}>{value}</div>
      <div style={{ color: palette.subtle, fontSize: typography.size.xs }}>{hint}</div>
    </Card>
  );
}

function ListCard({ title, items, variant }: { title: string; items: string[]; variant: 'risk' | 'warning' | 'evidence' }) {
  return (
    <Card>
      <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center', marginBottom: spacing.sm }}>
        <Badge variant={variant}>{title}</Badge>
      </div>
      {items.length ? (
        <ul style={{ margin: 0, paddingLeft: spacing.md, fontSize: typography.size.sm }}>
          {items.map((it, i) => <li key={i} style={{ marginBottom: spacing.xs }}>{it}</li>)}
        </ul>
      ) : (
        <p style={{ color: palette.subtle, fontSize: typography.size.xs, margin: 0 }}>None captured.</p>
      )}
    </Card>
  );
}
