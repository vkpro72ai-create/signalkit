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
import { useI18n, useT } from '../../../../lib/i18n';
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

type UILocale = 'ru' | 'en';

const LABELS: Record<UILocale, Record<string, string>> = {
  en: {
    openVentureThesis: 'Open Venture Thesis',
    generateVentureThesis: 'Generate Venture Thesis',
    openPack: 'Open Build-Ready Product Pack',
    generatePack: 'Generate Build-Ready Product Pack',
    generating: 'Generating…',
    aiActionError: 'AI action error',
    ventureRegenerated: 'Venture Thesis regenerated through the backend LLM router.',
    ventureGenerationFailed: 'Could not generate the Venture Thesis.',
    packGenerationFailed: 'Could not generate the Product Pack.',
    founderVerdict: 'Founder verdict',
    ventureThesis: 'Venture Thesis',
    evidenceAndClaims: 'Evidence & claims',
    userPain: 'User pain',
    targetAudience: 'Target audience',
    whyNow: 'Why now',
    marketWedge: 'Market wedge',
    productWedge: 'Product wedge',
    monetization: 'Monetization',
    competitors: 'Competitors',
    opportunity: 'Opportunity',
    confidenceSeparate: 'Confidence (separate)',
    dimension: 'Dimension',
    score: 'Score',
    weight: 'Weight',
    assumption: 'assumption',
    evidence: 'evidence',
    reasonWhy: 'Why',
    ventureScale: 'Venture scale',
    ventureConfidence: 'Venture confidence',
    goodOpportunity: 'Good opportunity?',
    howSupported: 'How supported?',
    couldItBeLarge: 'Could it be large?',
    evidenceCoverage: 'Evidence coverage',
    userPainEconomics: 'User pain economics',
    targetCustomer: 'Target customer',
    expansionPath: 'Expansion path',
    aiUnlock: 'AI unlock (product wedge)',
    distributionWedge: 'Distribution wedge',
    dataWorkflowMoat: 'Data / workflow moat',
    marketConstraints: 'Market constraints',
    risks: 'Risks',
    whatMustBeTrue: 'What must be true',
    validationPlan: 'Validation plan',
    assumptionsNotFacts: 'Assumptions (not facts)',
    ventureScaleDimensions: 'Venture scale dimensions',
    reasoning: 'Reasoning',
    ventureScaleFootnote: 'Venture scale is potential, not a guarantee. No fabricated TAM — weak market size stays an assumption.',
    noVentureThesis: 'No venture thesis yet. Rescore the niche to generate the Breakout Opportunity analysis.',
    compareMarkets: 'Compare markets',
    first: 'First',
    avoid: 'Avoid',
    market: 'Market',
    overall: 'Overall',
    readiness: 'Readiness',
    competition: 'Competition',
    regulatoryRisk: 'Reg. risk',
    marketsEmpty: 'Set multiple target markets on the project (Compare several markets) and run a comparison.',
    noneCaptured: 'None captured.',
  },
  ru: {
    openVentureThesis: 'Открыть венчурный тезис',
    generateVentureThesis: 'Сгенерировать венчурный тезис',
    openPack: 'Открыть Build-Ready Product Pack',
    generatePack: 'Создать Build-Ready Product Pack',
    generating: 'Генерация…',
    aiActionError: 'Ошибка AI-действия',
    ventureRegenerated: 'Венчурный тезис пересчитан через backend LLM router.',
    ventureGenerationFailed: 'Не удалось сгенерировать венчурный тезис.',
    packGenerationFailed: 'Не удалось создать Product Pack.',
    founderVerdict: 'Вердикт фаундера',
    ventureThesis: 'Венчурный тезис',
    evidenceAndClaims: 'Доказательства и выводы',
    userPain: 'Боль пользователя',
    targetAudience: 'Целевая аудитория',
    whyNow: 'Почему сейчас',
    marketWedge: 'Рыночный клин',
    productWedge: 'Продуктовый клин',
    monetization: 'Монетизация',
    competitors: 'Конкуренты',
    opportunity: 'Возможность',
    confidenceSeparate: 'Уверенность (отдельно)',
    dimension: 'Измерение',
    score: 'Оценка',
    weight: 'Вес',
    assumption: 'гипотеза',
    evidence: 'доказательство',
    reasonWhy: 'Почему',
    ventureScale: 'Венчурный масштаб',
    ventureConfidence: 'Уверенность венчурного тезиса',
    goodOpportunity: 'Хорошая возможность?',
    howSupported: 'Насколько подтверждено?',
    couldItBeLarge: 'Может ли стать большим?',
    evidenceCoverage: 'Покрытие доказательствами',
    userPainEconomics: 'Экономика боли пользователя',
    targetCustomer: 'Целевая аудитория',
    expansionPath: 'Путь расширения',
    aiUnlock: 'AI unlock (продуктовый клин)',
    distributionWedge: 'Дистрибуционный клин',
    dataWorkflowMoat: 'Data / workflow moat',
    marketConstraints: 'Ограничения рынка',
    risks: 'Риски',
    whatMustBeTrue: 'Что должно быть правдой',
    validationPlan: 'План валидации',
    assumptionsNotFacts: 'Гипотезы (не факты)',
    ventureScaleDimensions: 'Измерения венчурного масштаба',
    reasoning: 'Обоснование',
    ventureScaleFootnote: 'Венчурный масштаб — это потенциал, а не гарантия. Никакого выдуманного TAM: слабая оценка рынка остаётся гипотезой.',
    noVentureThesis: 'Венчурного тезиса пока нет. Пересчитайте возможность, чтобы получить Breakout Opportunity анализ.',
    compareMarkets: 'сравнить рынки',
    first: 'Первый',
    avoid: 'Избегать',
    market: 'Рынок',
    overall: 'Итог',
    readiness: 'Готовность',
    competition: 'Конкуренция',
    regulatoryRisk: 'Рег. риск',
    marketsEmpty: 'Укажите несколько целевых рынков в проекте и запустите сравнение.',
    noneCaptured: 'Пока ничего нет.',
  },
};

export default function NicheDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const { locale } = useI18n();
  const uiLocale: UILocale = locale === 'ru' ? 'ru' : 'en';
  const l = LABELS[uiLocale];
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

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
    setActionError(null);
    try {
      setVenture(await apiPost<VentureThesisRow>(`/workspaces/${ws}/niches/${id}/venture-thesis/regenerate`));
      setTab('venture');
      setActionInfo(l.ventureRegenerated);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : l.ventureGenerationFailed);
    } finally {
      setBusy(false);
    }
  }

  async function generateProductPack() {
    if (!ws) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await apiPost<{ pack: { id: string } }>(`/workspaces/${ws}/niches/${id}/generate-pack`, {
        depth: 'build_ready',
        vertical: 'b2b_saas',
        useLlm: true,
      });
      router.push(`/signalkit/packs/${res.pack.id}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : l.packGenerationFailed);
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
              {venture ? l.openVentureThesis : l.generateVentureThesis}
            </Button>
            {packs[0] ? (
              <Link href={`/signalkit/packs/${packs[0].id}`} style={{ textDecoration: 'none' }}>
                <Button>{l.openPack}</Button>
              </Link>
            ) : (
              <Button onClick={() => void generateProductPack()} disabled={busy}>
                {busy ? l.generating : l.generatePack}
              </Button>
            )}
          </div>
        }
      />

      {actionError && (
        <Card style={{ marginBottom: spacing.lg }}>
          <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.xs }}>{l.aiActionError}</div>
          <div style={{ color: palette.subtle, fontSize: typography.size.sm }}>{actionError}</div>
        </Card>
      )}

      {actionInfo && (
        <Card style={{ marginBottom: spacing.lg }}>
          <div style={{ color: palette.subtle, fontSize: typography.size.sm }}>{actionInfo}</div>
        </Card>
      )}

      {score ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <p style={{ margin: 0, fontSize: typography.size.sm }}>{score.explanation}</p>
        </Card>
      ) : null}

      <Tabs
        tabs={[
          { key: 'overview', label: l.founderVerdict },
          { key: 'score', label: t('pipeline.score') },
          { key: 'venture', label: l.ventureThesis },
          { key: 'markets', label: t('market.compare') },
          { key: 'evidence', label: l.evidenceAndClaims },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div style={{ marginTop: spacing.lg }}>
        {tab === 'overview' && (
          <Card>
            <Field label={l.userPain} value={niche.problem} />
            <Field label={l.targetAudience} value={niche.targetAudience} />
            <Field label={l.whyNow} value={niche.whyNow} />
            <Field label={l.marketWedge} value={venture?.thesis.entryWedge.text ?? '—'} />
            <Field label={l.productWedge} value={niche.mvpConcept} />
            <Field label={l.monetization} value={niche.monetization} />
            {niche.competitors.length ? <Field label={l.competitors} value={niche.competitors.join('; ')} /> : null}
          </Card>
        )}

        {tab === 'score' && score && (
          <>
            <div style={{ display: 'flex', gap: spacing.lg, marginBottom: spacing.lg }}>
              <Card style={{ flex: 1 }}>
                <div style={{ color: palette.subtle, fontSize: typography.size.xs }}>{l.opportunity}</div>
                <div style={{ fontSize: typography.size['2xl'], fontWeight: typography.weight.bold }}>{score.totalScore}/100</div>
              </Card>
              <Card style={{ flex: 1 }}>
                <div style={{ color: palette.subtle, fontSize: typography.size.xs }}>{l.confidenceSeparate}</div>
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
                { key: 'd', header: l.dimension, render: (b: Dim) => b.dimension.replace(/_/g, ' ') },
                { key: 's', header: l.score, render: (b) => String(b.score) },
                { key: 'w', header: l.weight, render: (b) => b.weight.toFixed(2) },
                { key: 'g', header: '', render: (b) => (b.assumptionBased ? <Badge variant="warning">{l.assumption}</Badge> : <Badge variant="evidence">{l.evidence}</Badge>) },
                { key: 'e', header: l.reasonWhy, render: (b) => <span style={{ color: palette.subtle, fontSize: typography.size.xs }}>{b.explanation}</span> },
              ]}
              rows={score.breakdown}
            />
            {scenarios ? (
              <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: spacing.md, marginTop: spacing.lg }}>
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
              <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: spacing.md, marginBottom: spacing.lg }}>
                <ScoreCard label={l.opportunity} value={score ? `${score.totalScore}/100` : 'n/a'} hint={l.goodOpportunity} />
                <ScoreCard label={t('label.confidence')} value={score ? `${Math.round(score.confidenceValue * 100)}%` : 'n/a'} hint={l.howSupported} />
                <ScoreCard label={l.ventureScale} value={`${venture.ventureScaleScore}/100`} hint={l.couldItBeLarge} />
                <ScoreCard label={l.ventureConfidence} value={`${Math.round(venture.ventureScaleConfidence * 100)}%`} hint={l.evidenceCoverage} />
              </div>

              <Card style={{ marginBottom: spacing.lg }}>
                <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>{l.founderVerdict}</h2>
                <p style={{ margin: 0, fontSize: typography.size.sm }}>{venture.thesis.breakoutThesis}</p>
              </Card>

              <Card style={{ marginBottom: spacing.lg }}>
                <Field label={l.whyNow} value={venture.thesis.whyNow.text} />
                <Field label={l.userPainEconomics} value={venture.thesis.painEconomics.text} />
                <Field label={l.targetCustomer} value={venture.thesis.targetCustomer} />
                <SecField label={l.marketWedge} s={venture.thesis.entryWedge} badgeLabels={{ assumption: l.assumption, evidence: l.evidence }} />
                <SecField label={l.expansionPath} s={venture.thesis.expansionPath} badgeLabels={{ assumption: l.assumption, evidence: l.evidence }} />
                <SecField label={l.aiUnlock} s={venture.thesis.aiUnlock} badgeLabels={{ assumption: l.assumption, evidence: l.evidence }} />
                <SecField label={l.distributionWedge} s={venture.thesis.distributionWedge} badgeLabels={{ assumption: l.assumption, evidence: l.evidence }} />
                <SecField label={l.dataWorkflowMoat} s={venture.thesis.dataWorkflowMoat} badgeLabels={{ assumption: l.assumption, evidence: l.evidence }} />
                <Field label={l.monetization} value={venture.thesis.monetizationPath} />
                <Field label={l.marketConstraints} value={venture.thesis.marketConstraints} />
              </Card>

              <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg, marginBottom: spacing.lg }}>
                <ListCard title={l.risks} items={venture.thesis.killReasons} variant="risk" emptyLabel={l.noneCaptured} />
                <ListCard title={l.whatMustBeTrue} items={venture.whatMustBeTrue.length ? venture.whatMustBeTrue : venture.thesis.whatMustBeTrue} variant="warning" emptyLabel={l.noneCaptured} />
                <ListCard title={l.validationPlan} items={venture.thesis.firstValidationExperiments} variant="evidence" emptyLabel={l.noneCaptured} />
                <ListCard title={l.assumptionsNotFacts} items={venture.thesis.assumptions} variant="warning" emptyLabel={l.noneCaptured} />
              </div>

              <Card>
                <h2 style={{ fontSize: typography.size.lg, marginTop: 0 }}>{l.ventureScaleDimensions}</h2>
                <Table
                  columns={[
                    { key: 'd', header: l.dimension, render: (b: VentureScaleDim) => b.dimension.replace(/_/g, ' ') },
                    { key: 's', header: l.score, render: (b) => String(b.score) },
                    { key: 'g', header: '', render: (b) => (b.assumptionBased ? <Badge variant="warning">{l.assumption}</Badge> : <Badge variant="evidence">{l.evidence}</Badge>) },
                    { key: 'r', header: l.reasoning, render: (b) => <span style={{ color: palette.subtle, fontSize: typography.size.xs }}>{b.reasoning}</span> },
                  ]}
                  rows={venture.ventureScaleBreakdown}
                />
                <p style={{ color: palette.subtle, fontSize: typography.size.xs, marginBottom: 0 }}>
                  {l.ventureScaleFootnote}
                </p>
              </Card>
            </>
          ) : (
            <Card>
              <p style={{ color: palette.subtle, fontSize: typography.size.sm, margin: 0 }}>
                {l.noVentureThesis}
              </p>
            </Card>
          )
        )}

        {tab === 'markets' && (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', marginBottom: spacing.md }}>
              <h2 style={{ fontSize: typography.size.lg, margin: 0 }}>{t('market.compare')}</h2>
              <Button variant="secondary" onClick={() => void compare()}>{l.compareMarkets}</Button>
            </div>
            {markets && markets.markets.length ? (
              <>
                <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.md }}>
                  {markets.firstMarketRecommendation ? <Badge variant="success">{l.first}: {markets.firstMarketRecommendation}</Badge> : null}
                  {markets.marketToAvoid ? <Badge variant="risk">{l.avoid}: {markets.marketToAvoid}</Badge> : null}
                </div>
                <Table
                  columns={[
                    { key: 'c', header: l.market, render: (m: MarketCompare['markets'][number]) => m.country },
                    { key: 'o', header: l.overall, render: (m) => String(m.overall) },
                    { key: 'r', header: l.readiness, render: (m) => String(m.marketReadiness) },
                    { key: 'w', header: 'WTP', render: (m) => String(m.willingnessToPay) },
                    { key: 'x', header: l.competition, render: (m) => String(m.competition) },
                    { key: 'g', header: l.regulatoryRisk, render: (m) => String(m.regulatoryRisk) },
                  ]}
                  rows={markets.markets}
                />
              </>
            ) : (
              <p style={{ color: palette.subtle, fontSize: typography.size.sm }}>
                {l.marketsEmpty}
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

function SecField({ label, s, badgeLabels }: { label: string; s: ThesisSection; badgeLabels: { assumption: string; evidence: string } }) {
  return (
    <div style={{ padding: `${spacing.sm}px 0`, borderBottom: `${border.hairline}px solid ${palette.line}` }}>
      <div style={{ color: palette.subtle, fontSize: typography.size.xs, display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
        {label}{s.assumption ? <Badge variant="warning">{badgeLabels.assumption}</Badge> : <Badge variant="evidence">{badgeLabels.evidence}</Badge>}
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

function ListCard({ title, items, variant, emptyLabel }: { title: string; items: string[]; variant: 'risk' | 'warning' | 'evidence'; emptyLabel: string }) {
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
        <p style={{ color: palette.subtle, fontSize: typography.size.xs, margin: 0 }}>{emptyLabel}</p>
      )}
    </Card>
  );
}
