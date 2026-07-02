'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { spacing, typography } from '@signalkit/ui';
import type { ConfidenceLevel, RiskLevel } from '@signalkit/shared';
import {
  Card,
  PageHeader,
  Badge,
  Button,
  ScoreBadge,
  ConfidenceBadge,
  RiskBadge,
  EvidenceBadge,
  EmptyState,
  LoadingState,
  ErrorState,
  palette,
} from '../../../components/ui';
import { useI18n, useT } from '../../../lib/i18n';
import {
  firstWorkspaceId,
  workspaceApi,
  opportunityApi,
  apiPost,
  type AiRunMetadata,
  type DiscoverOpportunitiesResult,
  type GeneratedOpportunityCard,
} from '../../../lib/api';

// ────────────────────────────────────────────────────────────────────────────
// Local label dictionary — avoids touching the global i18n package for now.
// ────────────────────────────────────────────────────────────────────────────

type UILocale = 'ru' | 'en';

const DIRECTION_OPTIONS: Array<{ value: string; label: Record<UILocale, string> }> = [
  { value: 'AI / Automation', label: { ru: 'ИИ / Автоматизация', en: 'AI / Automation' } },
  { value: 'Health / Medicine', label: { ru: 'Здоровье / Медицина', en: 'Health / Medicine' } },
  { value: 'Mental health / Psychology', label: { ru: 'Ментальное здоровье / Психология', en: 'Mental health / Psychology' } },
  { value: 'Food / Nutrition', label: { ru: 'Еда / Питание', en: 'Food / Nutrition' } },
  { value: 'Fitness / Sport / Recovery', label: { ru: 'Фитнес / Спорт / Восстановление', en: 'Fitness / Sport / Recovery' } },
  { value: 'Education / Learning', label: { ru: 'Образование / Обучение', en: 'Education / Learning' } },
  { value: 'Travel / Mobility', label: { ru: 'Путешествия / Мобильность', en: 'Travel / Mobility' } },
  { value: 'Finance / Insurance / Payments', label: { ru: 'Финансы / Страхование / Платежи', en: 'Finance / Insurance / Payments' } },
  { value: 'Legal / Compliance / RegTech', label: { ru: 'Право / Комплаенс / RegTech', en: 'Legal / Compliance / RegTech' } },
  { value: 'Real estate / Construction', label: { ru: 'Недвижимость / Строительство', en: 'Real estate / Construction' } },
  { value: 'Climate / Energy / Water', label: { ru: 'Климат / Энергия / Вода', en: 'Climate / Energy / Water' } },
  { value: 'Cybersecurity / Trust / Fraud', label: { ru: 'Кибербезопасность / Доверие / Фрод', en: 'Cybersecurity / Trust / Fraud' } },
  { value: 'Engineering / Manufacturing / Robotics', label: { ru: 'Инженерия / Производство / Робототехника', en: 'Engineering / Manufacturing / Robotics' } },
  { value: 'Logistics / Supply chain', label: { ru: 'Логистика / Цепочки поставок', en: 'Logistics / Supply chain' } },
  { value: 'Consumer / Lifestyle', label: { ru: 'Потребительские продукты / Лайфстайл', en: 'Consumer / Lifestyle' } },
  { value: 'Creator / Media / Gaming', label: { ru: 'Креаторы / Медиа / Игры', en: 'Creator / Media / Gaming' } },
  { value: 'SMB / Local business', label: { ru: 'SMB / Локальный бизнес', en: 'SMB / Local business' } },
  { value: 'Enterprise workflow', label: { ru: 'Корпоративные процессы', en: 'Enterprise workflow' } },
  { value: 'Gov / Defense / Public sector', label: { ru: 'Госсектор / Оборона / Публичный сектор', en: 'Gov / Defense / Public sector' } },
  { value: 'Detection / Monitoring / Intelligence', label: { ru: 'Детектирование / Мониторинг / Аналитика', en: 'Detection / Monitoring / Intelligence' } },
];

const PRODUCT_FORMAT_OPTIONS: Array<{ value: string; label: Record<UILocale, string> }> = [
  { value: 'saas', label: { ru: 'SaaS', en: 'SaaS' } },
  { value: 'web_app', label: { ru: 'Веб-приложение', en: 'Web app' } },
  { value: 'mobile_app', label: { ru: 'Мобильное приложение', en: 'Mobile app' } },
  { value: 'api_platform', label: { ru: 'API / платформа', en: 'API / platform' } },
  { value: 'marketplace', label: { ru: 'Маркетплейс', en: 'Marketplace' } },
  { value: 'service', label: { ru: 'Сервис', en: 'Service' } },
  { value: 'physical_product', label: { ru: 'Физический продукт', en: 'Physical product' } },
];

const RU = {
  opportunities: 'Возможности',
  findOpportunities: 'Найти возможности',
  developMyIdea: 'Развить мою идею',
  searchSetup: 'Настройка поиска',
  direction: 'Направление',
  anyDirection: 'Любое направление',
  subthemes: 'Подтемы',
  audience: 'Аудитория',
  productFormat: 'Формат продукта',
  anyFormat: 'Любой формат',
  riskTolerance: 'Допустимый риск',
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  outputLanguage: 'Язык результата',
  russian: 'Русский',
  english: 'Английский',
  investorLens: 'Инвесторский радар',
  findBtn: 'Найти возможности',
  finding: 'Поиск…',
  describeIdea: 'Опишите идею',
  describeIdeaPlaceholder: 'Опишите идею как фаундер: для кого продукт, какую большую проблему он решает, каким он может стать в идеале, какие рынки или сценарии важны.',
  targetMarket: 'Целевой рынок',
  targetMarketPlaceholder: 'например, Восточная Европа',
  targetAudience: 'Аудитория',
  targetAudiencePlaceholder: 'например, владельцы малого бизнеса',
  subthemesPlaceholder: 'автоматизация, комплаенс',
  audiencePlaceholder: 'владельцы малого бизнеса',
  productFormatLabel: 'Формат продукта',
  executionMode: 'Режим реализации',
  teamStudio: 'Команда / студия',
  aiAgentBundle: 'AI-агент / вайб-кодинг',
  both: 'Оба варианта',
  evidenceMode: 'Режим доказательств',
  starterHypothesis: 'Стартовая гипотеза',
  sourceBacked: 'С опорой на источники',
  deepResearchLater: 'Глубокое исследование позже',
  createPackBtn: 'Создать Build-Ready Product Pack',
  developingIdea: 'Разворачиваем идею в Build-Ready Product Pack…',
  discoveryError: 'Ошибка поиска',
  aiRunMetadata: 'Метаданные AI-запроса',
  inputTokens: 'токенов входа',
  outputTokens: 'токенов выхода',
  noProjectTitle: 'Нет проекта',
  noProjectBody: 'Сначала создайте проект, затем запустите поиск возможностей.',
  goToDashboard: 'На панель',
  emptyTitle: 'Найти возможности',
  emptyBody: 'SignalKit сканирует реальные сигналы и доказательства для поиска продуктовых возможностей. Без хайпа, без выдуманных цифр.',
  targetMarketCard: 'Целевой рынок',
  assumption: 'Допущение',
  score: 'Оценка возможности',
  confidence: 'Уверенность',
  ventureScale: 'Венчурный потенциал',
  buildReadiness: 'Готовность к сборке',
  evidence: 'Доказательства',
  risk: 'Риск',
  noFabricated: 'Нет сфабрикованной оценки рынка',
  notes: 'Заметки',
  evidenceBacked: 'на базе доказательств',
};

const EN = {
  opportunities: 'Opportunities',
  findOpportunities: 'Find opportunities',
  developMyIdea: 'Develop my idea',
  searchSetup: 'Search setup',
  direction: 'Direction',
  anyDirection: 'Any direction',
  subthemes: 'Subthemes',
  audience: 'Audience',
  productFormat: 'Product format',
  anyFormat: 'Any format',
  riskTolerance: 'Risk tolerance',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  outputLanguage: 'Output language',
  russian: 'Russian',
  english: 'English',
  investorLens: 'Investor lens',
  findBtn: 'Find opportunities',
  finding: 'Finding…',
  describeIdea: 'Describe your idea',
  describeIdeaPlaceholder: 'Describe your idea as a founder: who the product is for, what big problem it solves, what it could ideally become, which markets or scenarios matter.',
  targetMarket: 'Target market',
  targetMarketPlaceholder: 'e.g. Eastern Europe',
  targetAudience: 'Target audience',
  targetAudiencePlaceholder: 'e.g. small business owners',
  subthemesPlaceholder: 'automation, compliance',
  audiencePlaceholder: 'SMB owners',
  productFormatLabel: 'Product format',
  executionMode: 'Execution mode',
  teamStudio: 'Team / studio',
  aiAgentBundle: 'AI agent / vibe coding',
  both: 'Both',
  evidenceMode: 'Evidence mode',
  starterHypothesis: 'Starter hypothesis',
  sourceBacked: 'Source-backed',
  deepResearchLater: 'Deep research later',
  createPackBtn: 'Create Build-Ready Product Pack',
  developingIdea: 'Developing your idea into a Build-Ready Product Pack…',
  discoveryError: 'Discovery error',
  aiRunMetadata: 'AI Run Metadata',
  inputTokens: 'input tokens',
  outputTokens: 'output tokens',
  noProjectTitle: 'No project yet',
  noProjectBody: 'Create a project first, then run discovery to surface evidence-backed opportunities.',
  goToDashboard: 'Go to dashboard',
  emptyTitle: 'Find opportunities',
  emptyBody: 'SignalKit scans real signals and evidence for product opportunities worth building. No hype, no fake TAM.',
  targetMarketCard: 'Target market',
  assumption: 'Assumption',
  score: 'Score',
  confidence: 'Confidence',
  ventureScale: 'Venture scale',
  buildReadiness: 'Build readiness',
  evidence: 'Evidence',
  risk: 'Risk',
  noFabricated: 'No fabricated market sizing',
  notes: 'Notes',
  evidenceBacked: 'evidence-backed',
};

function labels(locale: UILocale) {
  return locale === 'ru' ? RU : EN;
}

function formatOpportunityCount(locale: UILocale, count: number) {
  if (locale === 'ru') {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return `${count} возможность`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} возможности`;
    return `${count} возможностей`;
  }
  return `${count} ${count === 1 ? 'opportunity' : 'opportunities'}`;
}

// ────────────────────────────────────────────────────────────────────────────

export default function OpportunitiesPage() {
  const { locale } = useI18n();
  const uiLocale: UILocale = locale === 'ru' ? 'ru' : 'en';
  const l = labels(uiLocale);
  const t = useT();
  const router = useRouter();

  const [state, setState] = useState<'loading' | 'error' | 'ready' | 'no_project'>('loading');
  const [ws, setWs] = useState<string | null>(null);
  const [pid, setPid] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<GeneratedOpportunityCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<AiRunMetadata | null>(null);

  // Tab state: 'discovery' | 'founder_idea'
  const [activeTab, setActiveTab] = useState<'discovery' | 'founder_idea'>('discovery');

  // Discovery form state
  const [direction, setDirection] = useState('');
  const [subthemesInput, setSubthemesInput] = useState('');
  const [audienceInput, setAudienceInput] = useState('');
  const [productFormat, setProductFormat] = useState('');
  const [riskTolerance, setRiskTolerance] = useState<'low' | 'medium' | 'high'>('medium');
  const [language, setLanguage] = useState<string>(uiLocale);
  const [investorLens, setInvestorLens] = useState(true);

  // Founder idea form state
  const [founderIdea, setFounderIdea] = useState('');
  const [fiTargetMarket, setFiTargetMarket] = useState('');
  const [fiTargetAudience, setFiTargetAudience] = useState('');
  const [fiProductFormat, setFiProductFormat] = useState('');
  const [fiOutputLanguage, setFiOutputLanguage] = useState<string>(uiLocale === 'ru' ? 'ru' : 'en');
  const [fiExecutionMode, setFiExecutionMode] = useState<'team_studio' | 'ai_agent_bundle' | 'both'>('both');
  const [fiEvidenceMode, setFiEvidenceMode] = useState<'starter_hypothesis' | 'source_backed' | 'deep_research'>('starter_hypothesis');
  const [fiRiskTolerance, setFiRiskTolerance] = useState<'low' | 'medium' | 'high'>('medium');
  const [fiNotes, setFiNotes] = useState('');
  const [founderIdeaLoading, setFounderIdeaLoading] = useState(false);
  const [founderIdeaError, setFounderIdeaError] = useState<string | null>(null);

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
      });
      applyDiscoveryResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : uiLocale === 'ru' ? 'Поиск не удался.' : 'Discovery failed.');
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

  async function submitFounderIdea() {
    if (!ws || !pid) return;
    if (founderIdea.trim().length < 50) {
      setFounderIdeaError(uiLocale === 'ru' ? 'Идея должна содержать минимум 50 символов.' : 'Idea must be at least 50 characters.');
      return;
    }
    setFounderIdeaLoading(true);
    setFounderIdeaError(null);
    try {
      // Step 1: Create the founder-supplied opportunity
      const opportunity = await opportunityApi.createFromIdea(ws, pid, {
        founderIdea: founderIdea.trim(),
        targetMarket: fiTargetMarket.trim() || undefined,
        targetAudience: fiTargetAudience.trim() || undefined,
        productFormat: fiProductFormat.trim() || undefined,
        outputLanguage: fiOutputLanguage,
        executionMode: fiExecutionMode,
        evidenceMode: fiEvidenceMode,
        riskTolerance: fiRiskTolerance,
        notes: fiNotes.trim() || undefined,
      });
      setOpportunities((current) => [opportunity, ...current.filter((item) => item.id !== opportunity.id)]);

      // Step 2: Generate the Build-Ready Product Pack
      try {
        const res = await apiPost<{ pack: { id: string } }>(`/workspaces/${ws}/niches/${opportunity.id}/generate-pack`, {
          depth: 'build_ready',
          vertical: 'b2b_saas',
          useLlm: true,
        });
        router.push(`/signalkit/packs/${res.pack.id}`);
      } catch (e) {
        const code = e instanceof Error ? e.message : 'pack_generation_failed';
        // Pack generation might fail but opportunity was created — show CTA.
        setFounderIdeaError(
          uiLocale === 'ru'
            ? `Возможность создана, но генерация Pack не удалась: ${code}`
            : `Opportunity created, but pack generation failed: ${code}`,
        );
      }
    } catch (e) {
      setFounderIdeaError(
        e instanceof Error ? e.message : uiLocale === 'ru' ? 'Не удалось создать возможность из идеи.' : 'Failed to create opportunity from idea.',
      );
    } finally {
      setFounderIdeaLoading(false);
    }
  }

  const sorted = [...opportunities].sort((a, b) => b.opportunityScore - a.opportunityScore);

  const isRu = uiLocale === 'ru';

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader
        title={l.opportunities}
        subtitle={`${formatOpportunityCount(uiLocale, opportunities.length)} · ${l.evidenceBacked}, ${l.noFabricated}`}
      />

      {/* ── Tab switcher ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.lg }}>
        <button
          onClick={() => setActiveTab('discovery')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: 8,
            fontWeight: typography.weight.semibold,
            fontSize: typography.size.sm,
            cursor: 'pointer',
            background: activeTab === 'discovery' ? '#0d6efd' : '#e9ecef',
            color: activeTab === 'discovery' ? 'white' : palette.subtle,
          }}
        >
          {l.findOpportunities}
        </button>
        <button
          onClick={() => setActiveTab('founder_idea')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: 8,
            fontWeight: typography.weight.semibold,
            fontSize: typography.size.sm,
            cursor: 'pointer',
            background: activeTab === 'founder_idea' ? '#0d6efd' : '#e9ecef',
            color: activeTab === 'founder_idea' ? 'white' : palette.subtle,
          }}
        >
          {l.developMyIdea}
        </button>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────── */}
      {error && (
        <Card style={{ marginBottom: spacing.lg }}>
          <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.xs }}>{l.discoveryError}</div>
          <div style={{ color: palette.subtle, fontSize: typography.size.sm }}>{error}</div>
        </Card>
      )}
      {founderIdeaError && (
        <Card style={{ marginBottom: spacing.lg }}>
          <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.xs }}>
            {isRu ? 'Ошибка' : 'Error'}
          </div>
          <div style={{ color: palette.subtle, fontSize: typography.size.sm }}>{founderIdeaError}</div>
        </Card>
      )}

      {/* ── Discovery tab ─────────────────────────────────────────────── */}
      {state === 'ready' && activeTab === 'discovery' && (
        <Card style={{ marginBottom: spacing.lg }}>
          <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.sm }}>{l.searchSetup}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: spacing.sm }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{l.direction}</span>
              <select
                value={direction}
                onChange={(event) => setDirection(event.target.value)}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                <option value="">{l.anyDirection}</option>
                {DIRECTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label[uiLocale]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{l.subthemes}</span>
              <input
                value={subthemesInput}
                onChange={(event) => setSubthemesInput(event.target.value)}
                placeholder={l.subthemesPlaceholder}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{l.audience}</span>
              <input
                value={audienceInput}
                onChange={(event) => setAudienceInput(event.target.value)}
                placeholder={l.audiencePlaceholder}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{l.productFormat}</span>
              <select
                value={productFormat}
                onChange={(event) => setProductFormat(event.target.value)}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                <option value="">{l.anyFormat}</option>
                {PRODUCT_FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label[uiLocale]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{l.riskTolerance}</span>
              <select
                value={riskTolerance}
                onChange={(event) => setRiskTolerance(event.target.value as 'low' | 'medium' | 'high')}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                <option value="low">{l.low}</option>
                <option value="medium">{l.medium}</option>
                <option value="high">{l.high}</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{l.outputLanguage}</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                <option value="ru">{l.russian}</option>
                <option value="en">{l.english}</option>
              </select>
            </label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm, fontSize: typography.size.sm }}>
            <input type="checkbox" checked={investorLens} onChange={(event) => setInvestorLens(event.target.checked)} />
            <span>{l.investorLens}</span>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: spacing.sm }}>
            <Button onClick={() => void discover()} disabled={busy}>
              {busy ? l.finding : l.findBtn}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Founder Idea tab ──────────────────────────────────────────── */}
      {state === 'ready' && activeTab === 'founder_idea' && (
        <Card style={{ marginBottom: spacing.lg }}>
          <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.sm }}>{l.developMyIdea}</div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm, marginBottom: spacing.md }}>
            <span>{l.describeIdea} *</span>
            <textarea
              value={founderIdea}
              onChange={(event) => setFounderIdea(event.target.value)}
              placeholder={l.describeIdeaPlaceholder}
              rows={6}
              style={{
                border: '1px solid #d0d7de',
                borderRadius: 6,
                padding: '10px 12px',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: spacing.sm }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{l.targetMarket}</span>
              <input
                value={fiTargetMarket}
                onChange={(event) => setFiTargetMarket(event.target.value)}
                placeholder={l.targetMarketPlaceholder}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{l.targetAudience}</span>
              <input
                value={fiTargetAudience}
                onChange={(event) => setFiTargetAudience(event.target.value)}
                placeholder={l.targetAudiencePlaceholder}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{l.productFormatLabel}</span>
              <select
                value={fiProductFormat}
                onChange={(event) => setFiProductFormat(event.target.value)}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                <option value="">{l.anyFormat}</option>
                {PRODUCT_FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label[uiLocale]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{l.outputLanguage}</span>
              <select
                value={fiOutputLanguage}
                onChange={(event) => setFiOutputLanguage(event.target.value as 'ru' | 'en')}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                <option value="ru">{l.russian}</option>
                <option value="en">{l.english}</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{l.executionMode}</span>
              <select
                value={fiExecutionMode}
                onChange={(event) => setFiExecutionMode(event.target.value as 'team_studio' | 'ai_agent_bundle' | 'both')}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                <option value="both">{l.both}</option>
                <option value="team_studio">{l.teamStudio}</option>
                <option value="ai_agent_bundle">{l.aiAgentBundle}</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{l.evidenceMode}</span>
              <select
                value={fiEvidenceMode}
                onChange={(event) => setFiEvidenceMode(event.target.value as 'starter_hypothesis' | 'source_backed' | 'deep_research')}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                <option value="starter_hypothesis">{l.starterHypothesis}</option>
                <option value="source_backed">{l.sourceBacked}</option>
                <option value="deep_research">{l.deepResearchLater}</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{l.riskTolerance}</span>
              <select
                value={fiRiskTolerance}
                onChange={(event) => setFiRiskTolerance(event.target.value as 'low' | 'medium' | 'high')}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px', background: 'white' }}
              >
                <option value="low">{l.low}</option>
                <option value="medium">{l.medium}</option>
                <option value="high">{l.high}</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm }}>
              <span>{l.notes}</span>
              <input
                value={fiNotes}
                onChange={(event) => setFiNotes(event.target.value)}
                placeholder={l.notes}
                style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: '8px 10px' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: spacing.lg }}>
            <Button onClick={() => void submitFounderIdea()} disabled={founderIdeaLoading}>
              {founderIdeaLoading ? l.developingIdea : l.createPackBtn}
            </Button>
          </div>
        </Card>
      )}

      {/* ── AI Run metadata ───────────────────────────────────────────── */}
      {lastRun && (
        <Card style={{ marginBottom: spacing.lg }}>
          <div style={{ fontWeight: typography.weight.semibold, marginBottom: spacing.sm }}>{l.aiRunMetadata}</div>
          <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
            <Badge variant="muted">{lastRun.durationMs} ms</Badge>
            <ConfidenceBadge level={lastRun.status === 'success' ? 'high' : 'low'} label={lastRun.status} />
            <EvidenceBadge count={lastRun.inputTokens ?? 0} label={l.inputTokens} />
            <EvidenceBadge count={lastRun.outputTokens ?? 0} label={l.outputTokens} />
          </div>
          <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginTop: spacing.sm }}>
            {lastRun.provider} / {lastRun.model} · {lastRun.task} · {new Date(lastRun.generatedAt).toLocaleString()}
            {lastRun.usageLogId ? ` · usage ${lastRun.usageLogId}` : ''}
          </div>
        </Card>
      )}

      {/* ── Global states ─────────────────────────────────────────────── */}
      {state === 'loading' && <LoadingState label={t('state.loading')} />}
      {state === 'error' && <ErrorState title={t('state.error.title')} body={t('state.error.body')} action={<Button variant="secondary" onClick={() => void load()}>{t('action.retry')}</Button>} />}
      {state === 'no_project' && (
        <EmptyState
          title={l.noProjectTitle}
          body={l.noProjectBody}
          action={<Link href="/signalkit" style={{ textDecoration: 'none' }}><Button variant="secondary">{l.goToDashboard}</Button></Link>}
        />
      )}

      {/* ── Opportunity cards ─────────────────────────────────────────── */}
      {state === 'ready' && (sorted.length === 0 ? (
        <EmptyState
          title={l.emptyTitle}
          body={l.emptyBody}
          action={<Button variant="secondary" onClick={() => void discover()} disabled={busy}>{busy ? l.finding : l.findBtn}</Button>}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
          {sorted.map((n) => (
            <Link key={n.id} href={`/signalkit/opportunities/${n.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Card>
                <div style={{ fontWeight: typography.weight.semibold }}>{n.name}</div>
                <div style={{ color: palette.subtle, fontSize: typography.size.sm, margin: `${spacing.xs}px 0 ${spacing.sm}px` }}>{n.oneLiner}</div>
                {n.targetMarket && (
                  <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginBottom: spacing.sm }}>
                    {l.targetMarketCard}: {n.targetMarket}
                  </div>
                )}
                {n.assumptions && n.assumptions.length > 0 && (
                  <div style={{ color: palette.subtle, fontSize: typography.size.xs, marginBottom: spacing.sm }}>
                    {l.assumption}: {n.assumptions[0]}
                  </div>
                )}
                <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                  <ScoreBadge score={n.opportunityScore} label={l.score} />
                  <ConfidenceBadge level={n.confidence.level as ConfidenceLevel} label={l.confidence} />
                  {n.ventureScaleScore != null && <ScoreBadge score={n.ventureScaleScore} label={l.ventureScale} />}
                  {n.buildReadinessScore != null && <ScoreBadge score={n.buildReadinessScore} label={l.buildReadiness} />}
                  <EvidenceBadge count={n.evidenceCount} label={l.evidence} />
                  <RiskBadge level={n.riskLevel as RiskLevel} label={l.risk} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
