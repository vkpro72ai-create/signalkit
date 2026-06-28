/**
 * Entitlement / paywall system.
 *
 * Production: integrate RevenueCat or Expo IAP here.
 * TODO(session-16): replace MockEntitlementProvider with real billing.
 *   - expo install react-native-purchases (RevenueCat)
 *   - or: expo install expo-in-app-purchases
 *
 * EXPO_PUBLIC_MOCK_BILLING=true → always returns Pro entitlements (dev only).
 */
import { createContext, useContext, useState, type ReactNode } from 'react';

export type Plan = 'free' | 'pro' | 'team';

export type Entitlements = {
  plan: Plan;
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

const FREE: Omit<Entitlements, 'upgrade' | 'restore' | 'isLoading'> = {
  plan: 'free',
  canExportPDF: false,
  canExportBundle: false,
  canExportMarkdown: false,
  canFullPack: false,
  canBuildBlueprint: false,
  canVentureThesis: true,
  canMultiMarket: false,
  canAdvancedBlueprintDetails: false,
};

const PRO: Omit<Entitlements, 'upgrade' | 'restore' | 'isLoading'> = {
  plan: 'pro',
  canExportPDF: true,
  canExportBundle: true,
  canExportMarkdown: true,
  canFullPack: true,
  canBuildBlueprint: true,
  canVentureThesis: true,
  canMultiMarket: true,
  canAdvancedBlueprintDetails: true,
};

const isMockBilling = process.env.EXPO_PUBLIC_MOCK_BILLING === 'true';

const EntitlementContext = createContext<Entitlements | null>(null);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<Plan>(isMockBilling ? 'pro' : 'free');
  const [isLoading] = useState(false);

  const caps = plan === 'free' ? FREE : PRO;

  function upgrade() {
    if (isMockBilling) {
      setPlan('pro');
    }
    // Production: open native purchase sheet via RevenueCat
  }

  async function restore() {
    if (isMockBilling) {
      setPlan('pro');
    }
    // Production: RevenueCat.restorePurchases()
  }

  return (
    <EntitlementContext.Provider value={{ ...caps, upgrade, restore, isLoading }}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlements() {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlements must be used within EntitlementProvider');
  return ctx;
}
