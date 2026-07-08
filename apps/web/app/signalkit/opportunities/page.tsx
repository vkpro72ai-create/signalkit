'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { spacing, typography } from '@signalkit/ui';
import { SUPPORTED_LOCALES, LOCALE_LANGUAGE_NAMES } from '@signalkit/shared';
import {
  Card,
  PageHeader,
  Badge,
  Button,
  ConfidenceBadge,
  EvidenceBadge,
  EmptyState,
  LoadingState,
  ErrorState,
  Table,
  palette,
} from '../../../components/ui';
import { buildOpportunityColumns } from '../../../components/dashboard';
import { useI18n, useT } from '../../../lib/i18n';
import {
  firstWorkspaceId,
  workspaceApi,
  opportunityApi,
  type AiRunMetadata,
  type DiscoverOpportunitiesResult,
  type GeneratedOpportunityCard,
} from '../../../lib/api';

const DIRECTION_OPTIONS = [
 'AI / Automation',
 'Health / Medicine',
 'Mental health / Psychology',
 'Food / Nutrition',
 'Fitness / Sport / Recovery',
 'Education / Learning',
 'Travel / Mobility',
 'Finance / Insurance / Payments',
 'Legal / Compliance / RegTech',
 'Real estate / Construction',
 'Climate / Energy / Water',
 'Cybersecurity / Trust / Fraud',
 'Engineering / Manufacturing / Robotics',
 'Logistics / Supply chain',
 'Consumer / Lifestyle',
 'Creator / Media / Gaming',
 'SMB / Local business',
 'Enterprise workflow',
 'Gov / Defense / Public sector',
 'Detection / Monitoring / Intelligence',
];

const IDEA_MIN_LENGTH = 40;

export default function OpportunitiesPage() {
  const t = useT();
  const { locale } = useI18n();
  const [state, setState] = useState<'loading' | 'error' | 'ready' | 'no_project'>('loading');
  const [ws, setWs] = useState<string | null>(null);
  const [pid, setPid] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<GeneratedOpportunityCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<AiRunMetadata | null>(null);
  const [direction, setDirection] = useState('');
  const [subthemesInput, setSubthemesInput] = useState('');
  const [audienceInput, setAudienceInput] = useState('');
  const [productFormat, setProductFormat] = useState('');
  const [riskTolerance, setRiskTolerance] = useState<'low' | 'medium' | 'high'>('medium');
  const [language, setLanguage] = useState<string>(locale);
  const [investorLens, setInvestorLens] = useState(true);

  const [tab, setTab] = useState<'find' | 'develop'>('find');
  const [founderIdea, setFounderIdea] = useState('');
  const [ideaTargetMarket, setIdeaTargetMarket] = useState('');
  const [ideaTargetAudience, setIdeaTargetAudience] = useState('');
  const [ideaProductFormat, setIdeaProductFormat] = useState('');
  const [ideaRiskTolerance, setIdeaRiskTolerance] = useState<'low' | 'medium' | 'high'>('medium');
  const [ideaEvidenceMode, setIdeaEvidenceMode] = useState<'starter_hypothesis' | 'source_backed' | 'deep_research'>('starter_hypothesis');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const workspaceId = await firstWorkspaceId();
      setWs(workspaceId);
      if (!workspaceId) return setState('no_project');
      const projects = await workspaceApi.listProjects(workspaceId);
      const projectId = projects[0]?.id ?? null;
      setPid(projectId);
      if (!projectId) return setState('no_project');
      setOpportunities(await opportunityApi.listAll(workspaceId));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function discover() {
    if (!ws || !pid) return;
    // Discovery replaces every existing opportunity in this project (and
    // cascades to delete any Product Document Packs built on them) — it does
    // not add to the list. Confirm before throwing away real work.
    if (opportunities.length > 0) {
      const warned = window.confirm(
        `This project already has ${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'}. ` +
          'Running discovery again will permanently delete them and any Product Document Packs built from them. Continue?',
      );
      if (!warned) return;
    }
    setBusy(true);
    setError(null);
    try {
      const subthemes = subthemesInput
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const audiences = audienceInput
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const result = await opportunityApi.discover(ws, pid, {
        directions: direction ? [direction] : undefined,
        subthemes: subthemes.length > 0 ? subthemes : undefined,
        audiences: audiences.length > 0 ? audiences : undefined,
        productFormats: productFormat ? [productFormat] : undefined,
        riskTolerance,
        language,
        investorLens,
        mode: 'find_opportunities',
        confirmReplace: opportunities.length > 0,
      });
      applyDiscoveryResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Discovery failed.');
    } finally {
      setBusy(false);
    }
  }

  function applyDiscoveryResult(result: DiscoverOpportunitiesResult) {
    setLastRun(result.generation);
    if (result.opportunities.length > 0) {
      setOpportunities(result.opportunities);
    }
  }

  async function developIdea() {
    if (!ws || !pid) return;
    if (founderIdea.trim().length < IDEA_MIN_LENGTH) {
      setError(t('opportunities.ideaTooShort'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await opportunityApi.createFromIdea(ws, pid, {
        founderIdea: founderIdea.trim(),
        targetMarket: ideaTargetMarket || undefined,
        targetAudience: ideaTargetAudience || undefined,
        productFormat: ideaProductFormat || undefined,
        riskTolerance: ideaRiskTolerance,
        evidenceMode: ideaEvidenceMode,
        outputLanguage: language,
      });
      setLastRun(result.generation);
      // Add alongside existing opportunities — createFromIdea does not replace them.
      setOpportunities((prev) => [...result.opportunities, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('opportunities.developError'));
    } finally {
      setBusy(false);
    }
  }

  const sorted = [...opportunities].sort((a, b) => b.opportunityScore - a.opportunityScore);

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader
        title={t('nav.opportunities')}
        subtitle={`${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'} · evidence-backed, no fabricated market sizing`}
        action={
          state === 'ready'
            ? tab === 'find'
              ? <Button onClick={() => void discover()} disabled={busy}>{busy ? 'Finding…' : t('opportunities.tabFind')}</Button>
              : <Button onClick={() => void developIdea()} disabled={busy}>{busy ? t('opportunities.developing') : t('opportunities.developSubmit')}</Button>
            : undefined
        }
      />

      {error && (
        <Card style={{ marginBottom: spacing.lg }}>
          <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.xs }}>Discovery error</div>
          <div style={{ color: palette.subtle, fontSize: typography.size.sm }}>{error}</div>
        </Card>
      )}

      {state === 'ready' && (
        <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.sm }}>
          <button
            type="button"
            onClick={() => setTab('find')}
            style={{
              padding: `${spacing.xs}px ${spacing.md}px`,
              borderRadius: 6,
              border: `1px solid ${tab === 'find' ? palette.ink : '#d0d7de'}`,
              background: tab === 'find' ? palette.ink : 'white',
              color: tab === 'find' ? 'white' : palette.ink,
              fontSize: typography.size.sm,
              cursor: 'pointer',
            }}
          >
            {t('opportunities.tabFind')}
          </button>
          <button
            type="button"
            onClick={() => setTab('develop')}
            style={{
              padding: `${spacing.xs}px ${spacing.md}px`,
              borderRadius: 6,
              border: `1px solid ${tab === 'develop' ? palette.ink : '#d0d7de'}`,
              background: tab === 'develop' ? palette.ink : 'white',
              color: tab === 'develop' ? 'white' : palette.ink,
              fontSize: typography.size.sm,
              cursor: 'pointer',
            }}
          >
            {t('opportunities.tabDevelop')}
          </button>
        </div>
      )}

      {state === 'ready' && tab === 'develop' && (
        <Card style={{ marginBottom: spacing.lg }}>
          <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.sm }}>{t('opportunities.tabDevelop')}</div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
            <span>{t('opportunities.ideaLabel')}</span>
            <textarea
              value={founderIdea}
              onChange={(event) => setFounderIdea(event.target.value)}
              placeholder={t('opportunities.ideaPlaceholder')}
              style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', minHeight: 140, fontFamily: 'inherit', fontSize: typography.size.sm }}
            />
            <span style={{ color: palette.subtle, fontSize: typography.size.xs }}>{t('opportunities.ideaMinLengthHint')}</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: spacing.sm, marginTop: spacing.sm }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{t('opportunities.targetMarketLabel')}</span>
              <input
                value={ideaTargetMarket}
                onChange={(event) => setIdeaTargetMarket(event.target.value)}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{t('opportunities.targetAudienceLabel')}</span>
              <input
                value={ideaTargetAudience}
                onChange={(event) => setIdeaTargetAudience(event.target.value)}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{t('opportunities.productFormatLabel')}</span>
              <input
                value={ideaProductFormat}
                onChange={(event) => setIdeaProductFormat(event.target.value)}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{t('label.risk')}</span>
              <select
                value={ideaRiskTolerance}
                onChange={(event) => setIdeaRiskTolerance(event.target.value as 'low' | 'medium' | 'high')}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{t('opportunities.evidenceModeLabel')}</span>
              <select
                value={ideaEvidenceMode}
                onChange={(event) => setIdeaEvidenceMode(event.target.value as 'starter_hypothesis' | 'source_backed' | 'deep_research')}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                <option value="starter_hypothesis">Starter hypothesis</option>
                <option value="source_backed">Source-backed</option>
                <option value="deep_research">Deep research later</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{t('export.language')}</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                {SUPPORTED_LOCALES.map((code) => (
                  <option key={code} value={code}>{LOCALE_LANGUAGE_NAMES[code]}</option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: spacing.sm }}>
            <Button onClick={() => void developIdea()} disabled={busy || founderIdea.trim().length < IDEA_MIN_LENGTH}>
              {busy ? t('opportunities.developing') : t('opportunities.developSubmit')}
            </Button>
          </div>
        </Card>
      )}

      {state === 'ready' && tab === 'find' && (
        <Card style={{ marginBottom: spacing.lg }}>
          <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.sm }}>Search setup</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: spacing.sm }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>Direction</span>
              <select
                value={direction}
                onChange={(event) => setDirection(event.target.value)}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                <option value="">Any direction</option>
                {DIRECTION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>Subthemes</span>
              <input
                value={subthemesInput}
                onChange={(event) => setSubthemesInput(event.target.value)}
                placeholder="automation, compliance"
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>Audience</span>
              <input
                value={audienceInput}
                onChange={(event) => setAudienceInput(event.target.value)}
                placeholder="SMB owners"
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>Product format</span>
              <select
                value={productFormat}
                onChange={(event) => setProductFormat(event.target.value)}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                <option value="">Any format</option>
                <option value="saas">SaaS</option>
                <option value="web_app">Web app</option>
                <option value="mobile_app">Mobile app</option>
                <option value="api_platform">API / platform</option>
                <option value="marketplace">Marketplace</option>
                <option value="service">Service</option>
                <option value="physical_product">Physical product</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>Risk tolerance</span>
              <select
                value={riskTolerance}
                onChange={(event) => setRiskTolerance(event.target.value as 'low' | 'medium' | 'high')}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{t('export.language')}</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                {SUPPORTED_LOCALES.map((code) => (
                  <option key={code} value={code}>{LOCALE_LANGUAGE_NAMES[code]}</option>
                ))}
              </select>
            </label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm, fontSize: typography.size.sm }}>
            <input type="checkbox" checked={investorLens} onChange={(event) => setInvestorLens(event.target.checked)} />
            <span>Investor lens</span>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: spacing.sm }}>
            <Button onClick={() => void discover()} disabled={busy}>
              {busy ? 'Finding…' : 'Find opportunities'}
            </Button>
          </div>
        </Card>
      )}

      {lastRun && (
        <Card style={{ marginBottom: spacing.lg }}>
          <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.sm }}>AI Run Metadata</div>
          <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
            <Badge variant="muted">{lastRun.durationMs} ms</Badge>
            <ConfidenceBadge level={lastRun.status === 'success' ? 'high' : 'low'} label={lastRun.status} />
            <EvidenceBadge count={lastRun.inputTokens ?? 0} label="input tokens" />
            <EvidenceBadge count={lastRun.outputTokens ?? 0} label="output tokens" />
          </div>
          <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: spacing.sm }}>
            {lastRun.provider} / {lastRun.model} · {lastRun.task} · {new Date(lastRun.generatedAt).toLocaleString()}
            {lastRun.usageLogId ? ` · usage ${lastRun.usageLogId}` : ''}
          </div>
        </Card>
      )}

      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />}
      {state === 'no_project' && (
        <EmptyState
          title="No project yet"
          body="Create a project first, then run discovery to surface evidence-backed opportunities."
          action={<Link href="/signalkit" style={{ textDecoration: 'none' }}><Button variant="secondary">Go to dashboard</Button></Link>}
        />
      )}

      {state === 'ready' && (sorted.length === 0 ? (
        <EmptyState
          title="Find opportunities"
          body="SignalKit scans real signals and evidence for product opportunities worth building. No hype, no fake TAM."
          action={<Button variant="secondary" onClick={() => void discover()} disabled={busy}>{busy ? 'Finding…' : 'Find opportunities'}</Button>}
        />
      ) : (
        <Card>
          <Table
            columns={buildOpportunityColumns(t, (row) => sorted.indexOf(row) + 1)}
            rows={sorted}
          />
        </Card>
      ))}
    </div>
  );
}
