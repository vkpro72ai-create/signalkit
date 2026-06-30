/**
 * Entitlement / paywall system — server-driven.
 *
 * Plan is read from GET /me → memberships[0].billingPlan (set by backend).
 * Internal testers get `founder_pro` or higher on their workspace; this
 * automatically unlocks all Pro features without any client-side hacks.
 *
 * Free → plan === 'free'
 * Pro  → plan === 'founder_pro' | 'agency' | 'studio' | 'enterprise'
 *
 * EXPO_PUBLIC_MOCK_BILLING=true bypasses the backend (dev only, not set in prod).
 *
 * Production billing: integrate RevenueCat in Session 16.
 *   expo install react-native-purchases
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from './auth';

export type Plan = 'free' | 'pro' | 'team';

export type Entitlements = {
  plan: Plan;
  /** Raw backend plan string (e.g. 'founder_pro') for debug display. */
  backendPlan: string;
  canExportPDF: boolean;
  canExportBundle: boolean;
  canExportMarkdown: boolean;
  canFullPack: boolean;
  canBuildBlueprint: boolean;
  canVentureThesis: boolean;
  canMultiMarket: boolean;
  canAdvancedBlueprintDetails: boolean;
  upgrade: () => void;
  restore: () => Promise<void>;
  isLoading: boolean;
};

const isMockBilling = process.env.EXPO_PUBLIC_MOCK_BILLING === 'true';

/** Map backend PlanType to mobile Plan. */
function toMobilePlan(backendPlan: string): Plan {
  if (backendPlan === 'free') return 'free';
  // founder_pro, agency, studio, enterprise → pro
  return 'pro';
}

const FREE_CAPS = {
  canExportPDF: false,
  canExportBundle: false,
  canExportMarkdown: false,
  canFullPack: false,
  canBuildBlueprint: false,
  canVentureThesis: true,
  canMultiMarket: false,
  canAdvancedBlueprintDetails: false,
};

const PRO_CAPS = {
  canExportPDF: true,
  canExportBundle: true,
  canExportMarkdown: true,
  canFullPack: true,
  canBuildBlueprint: true,
  canVentureThesis: true,
  canMultiMarket: true,
  canAdvancedBlueprintDetails: true,
};

const EntitlementContext = createContext<Entitlements | null>(null);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  const value = useMemo<Entitlements>(() => {
    const backendPlan: string = isMockBilling
      ? 'founder_pro'
      : (user?.billingPlan ?? 'free');

    const plan = toMobilePlan(backendPlan);
    const caps = plan === 'free' ? FREE_CAPS : PRO_CAPS;

    return {
      plan,
      backendPlan,
      ...caps,
      isLoading,
      upgrade() {
        // Production: open native purchase sheet via RevenueCat
      },
      async restore() {
        // Production: RevenueCat.restorePurchases()
      },
    };
  }, [user?.billingPlan, isLoading]);

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlements() {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlements must be used within EntitlementProvider');
  return ctx;
}
