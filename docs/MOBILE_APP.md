# SignalKit Mobile App

Session 15 · Premium Expo React Native mobile application.

---

## Product Strategy

SignalKit mobile is **not a thin companion viewer**. It is a complete standalone product experience for:

- **Founders** exploring breakout opportunities
- **PMs** reviewing Product Packs and governance status
- **Agencies** checking client-ready deliverables
- **Operators** reviewing Venture Thesis and Build Blueprint
- **Developers** checking build-readiness coverage

Mobile is optimized for read, review and triage. Heavy editing, source ingestion and LLM configuration remain web-first. Exports are triggered from the web Export Center; mobile shows status and notifies readiness.

### Primary Mobile Loop

1. Complete onboarding (role, target, market mode)
2. Authenticate against backend
3. View dashboard with top opportunity, scores and workspace status
4. Browse opportunities list → open Venture Thesis detail
5. Review Product Pack documents
6. Check Build Blueprint coverage
7. Track export status (download on web)
8. Hit paywall → upgrade to Pro for full access
9. Adjust settings (language, account, subscription)

---

## Onboarding Flow

**File:** `apps/mobile/app/onboarding.tsx`

Multi-step wizard in a single screen component:

| Step | Content |
|------|---------|
| 1–4 | Value proposition slides (Welcome, Signals→Thesis, Build Packs, Blueprints) |
| 5 | Role selection (Founder, PM, Agency, Investor, Developer) |
| 6 | Target selection (multi-select: startup ideas, validate, build docs, AI handoff, market research) |
| 7 | Market mode (Global, My country, Multi-market) |
| Final | → Login / Register |

- Progress bar shows step position
- Skip available from any step → goes to login
- Persisted via `OnboardingProvider` (in-memory dev, AsyncStorage in production)
- No gradients, no fake claims, no unicorn guarantees

---

## Paywall Architecture

**File:** `apps/mobile/app/paywall.tsx`

### Entitlement System

**File:** `apps/mobile/lib/entitlements.ts`

- `EntitlementProvider` manages subscription state
- `useEntitlements()` hook exposes plan + capability flags
- Mock mode: `EXPO_PUBLIC_MOCK_BILLING=true` → always returns Pro
- Production adapter: integrate RevenueCat or Expo IAP (Session 16)

### Capabilities gated by paywall

| Feature | Free | Pro | Team |
|---------|------|-----|------|
| Quick Opportunity Pack | ✓ | ✓ | ✓ |
| Full Pack depth | ✗ | ✓ | ✓ |
| PDF exports | ✗ | ✓ | ✓ |
| AI-Agent bundle | ✗ | ✓ | ✓ |
| Markdown ZIP | ✗ | ✓ | ✓ |
| Role briefs | ✗ | ✓ | ✓ |
| Multi-market | ✗ | ✓ | ✓ |
| Build Blueprint full | ✗ | ✓ | ✓ |
| White-label exports | ✗ | ✗ | ✓ |
| Team members | 1 | 1 | 5 |

### Plans

- **Free**: $0/mo
- **Pro**: $49/mo or $39/mo (annual) — MOST POPULAR
- **Team**: $149/mo or $119/mo (annual)

### Session 16 integration points

```typescript
// In lib/entitlements.ts, replace MockEntitlementProvider with:
import Purchases from 'react-native-purchases';

// Initialize in AuthProvider after login:
await Purchases.logIn(user.id);
const customerInfo = await Purchases.getCustomerInfo();

// Check entitlements:
const isPro = customerInfo.entitlements.active['pro'] !== undefined;
```

---

## Mobile Brand System

**File:** `apps/mobile/components/brand.tsx`

### Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `canvas` | `#F4F3EF` | Page background (warm off-white) |
| `surface` | `#FFFFFF` | Cards, panels |
| `brand` | `#1B4332` | Deep forest green — CTAs |
| `brandLight` | `#D8EFE4` | Light green tint |
| `ink` | `#1A1E2B` | Primary text |
| `subtle` | `#64748B` | Secondary text |
| `muted` | `#94A3B8` | Placeholder/disabled |

### Design Law

- ✅ Flat 2D premium
- ✅ Matte surfaces via `backgroundColor: rgba(255,255,255,0.88)`
- ✅ Soft shadows (`elevation` Android, `shadowOpacity: 0.06` iOS)
- ✅ Controlled depth through border + spacing
- ❌ No gradients
- ❌ No neon/glow
- ❌ No heavy glassmorphism

### Component Library

| Component | Description |
|-----------|-------------|
| `Surface` | Matte/frosted card wrapper |
| `Screen` | ScrollView with consistent padding |
| `Card`, `HeroCard` | Standard and featured cards |
| `Button` | primary / secondary / ghost / danger variants |
| `Badge` | Semantic color badge (opportunity/confidence/risk/warning/ready/muted) |
| `ScoreBadge` | Numeric score with automatic semantic color |
| `ScoreRing` | Circular score display (size configurable) |
| `ScoreBar` | Linear score bar with label |
| `ScoreGrid` | 4-score grid (Opportunity, Confidence, Venture, Build) |
| `Chip` | Toggle chip for filters/selection |
| `EmptyState` | Premium empty placeholder with icon, copy, CTA |
| `ErrorState` | Error display with retry |
| `SkeletonCard` | Loading skeleton |
| `ListRow` | Standard list item with icon, title, subtitle, badge |
| `SectionHeader` | Section title with optional action |
| `Avatar` | User avatar with initials |
| `StatusDot` | Colored dot for export status |
| `PaywallGate` | Blur/lock overlay for paywalled content |
| `PlanBadge` | Free/Pro/Team badge |
| `DocumentStatusPill` | Document workflow status |

---

## Motion System

Currently using React Native built-in animation primitives:

- `Pressable` `opacity` press state (0.88 pressed)
- `transform: [{ scale: 0.995 }]` on card press
- `ActivityIndicator` for loading states
- Scroll-based effects via `ScrollView`

**For production animations** (Session 16 enhancement):

```bash
expo install react-native-reanimated moti expo-haptics
```

```typescript
// Score ring reveal:
import Animated, { useSharedValue, withTiming } from 'react-native-reanimated';

// Bottom sheet:
import { BottomSheet } from '@gorhom/bottom-sheet'; // expo install @gorhom/bottom-sheet

// Haptics on primary actions:
import * as Haptics from 'expo-haptics';
// Already abstracted in lib/haptics.ts — just swap the implementation
```

---

## Auth / Session

**File:** `apps/mobile/lib/auth.ts`

- `AuthProvider` wraps the app in `_layout.tsx`
- Token stored via `SecureKV` (memory in dev, SecureStore in production)
- Auto-restore on app start via `useEffect`
- `useAuth()` exposes: `{ user, isLoading, isAuthenticated, login, register, logout }`
- 401 handling: `ApiException` with `status: 401` → `logout()` → redirect to `/login`
- Token never logged

### Production SecureStore upgrade

```bash
expo install expo-secure-store
```

```typescript
// In lib/storage.ts, replace MemoryStore with:
import * as SecureStore from 'expo-secure-store';

const secureStore: StorageAdapter = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
```

---

## API Client

**File:** `apps/mobile/lib/api.ts`

- Base URL from `EXPO_PUBLIC_API_URL`
- Auth token injected via `Authorization: Bearer <token>`
- Never calls LLM providers directly
- Typed response shapes via `packages/shared`
- Normalized errors → `ApiException(status, message)`
- Network unavailable → `ApiException(0, 'Network unavailable')`
- No hardcoded localhost in production (config-driven)

---

## Navigation Structure

```
app/
  _layout.tsx             ← Root: providers + auth/onboarding guard
  onboarding.tsx          ← Multi-step onboarding wizard
  login.tsx               ← Auth: email/password login
  register.tsx            ← Auth: account creation
  paywall.tsx             ← Paywall modal (plan cards, CTA)
  (tabs)/
    _layout.tsx           ← Bottom tab bar (5 tabs)
    index.tsx             ← Home dashboard
    opportunities.tsx     ← Opportunities list
    packs.tsx             ← Product Packs list
    exports.tsx           ← Export Center (status, download)
    settings.tsx          ← Account, language, subscription, logout
  opportunity/
    [id].tsx              ← Opportunity detail + Venture Thesis
  pack/
    [id].tsx              ← Pack detail + document reader
  blueprint/
    [id].tsx              ← Build Blueprint viewer
```

---

## Expo / EAS Setup

### Prerequisites

```bash
npm install -g eas-cli
npx expo login
```

### First-time project setup

```bash
cd apps/mobile
eas project:init   # creates EAS_PROJECT_ID, updates app.config.ts
eas credentials    # configure Android keystore + iOS certs
```

---

## Android APK Build

Two independent build paths exist. EAS is **not required** for a working APK.

---

### Path A — Local build (no EAS, no cloud credentials)

**Prerequisites:** JDK 17+, Android SDK with `ANDROID_HOME` set.

#### One-command shortcut

```bash
# From repo root:
pnpm --filter @signalkit/mobile apk:debug

# Or directly from apps/mobile:
cd apps/mobile
node scripts/apk-debug.js
```

This runs `expo prebuild --platform android` then `gradlew assembleDebug` in one step.

#### Step-by-step

```bash
# 1. Generate native android/ project from Expo config
cd apps/mobile
pnpm exec expo prebuild --platform android

# 2a. Windows — build debug APK
cd android
.\gradlew.bat assembleDebug

# 2b. macOS/Linux — build debug APK
cd android
./gradlew assembleDebug
```

#### Output

```
apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Install on a device or emulator:

```bash
adb install apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

#### Notes

- `android/` is gitignored (generated artifact, managed workflow). Regenerate with `expo prebuild`.
- First Gradle run downloads NDK + Maven deps (~10–20 min); subsequent runs are fast (incremental).
- To force a clean regeneration: `pnpm exec expo prebuild --platform android --clean`
- React Native new architecture (`newArchEnabled: true`) is on by default. Disable in `app.config.ts` if compatibility issues arise.
- **Kotlin version patch** — `expo prebuild` generates `android/build.gradle` without a pinned version for `kotlin-gradle-plugin`. RN's transitive deps resolve 1.9.24, but `expo-modules-core` Compose Compiler needs 1.9.25. The `apk-debug.js` script patches this automatically. If building via raw `gradlew` after a manual prebuild, edit `android/build.gradle` line `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')` and add `:${kotlinVersion}` to pin it.
- **JS bundle in debug APKs** — the RN Gradle plugin 0.76+ skips the JS bundle step for all variants in `debuggableVariants` (default: `["debug"]`). This means debug APKs ship without `assets/index.android.bundle` and show "Unable to load script" when launched without Metro. The legacy `bundleInDebug=true` property from `react.gradle` is **not honored** by the new plugin. The `apk-debug.js` script sets `debuggableVariants = []` in `android/app/build.gradle` so all variants embed the JS bundle. Without this patch, standalone debug APKs are broken.

---

### Path B — EAS cloud build (CI/store builds, no local SDK required)

```bash
# Preview APK (shareable, no store signing):
cd apps/mobile
eas build --platform android --profile preview

# Production AAB (Google Play):
eas build --platform android --profile production
```

Download output from the Expo dashboard after the build completes.

#### Required credentials for EAS

- `EXPO_TOKEN` (EAS authentication — set as env var or GitHub secret)
- `EAS_PROJECT_ID` = `092735b2-7500-4929-9160-e72a33d03bb4` (already in `app.config.ts`)
- Android keystore (EAS manages this automatically on first run)
- `EXPO_PUBLIC_API_URL` pointing to production API
- `EXPO_PUBLIC_MOCK_BILLING=false`

#### GitHub Actions (CI)

`.github/workflows/mobile-apk.yml` runs on push to `apps/mobile/**`. It uses `EXPO_TOKEN` from repo secrets and produces a preview APK via EAS. See [Secrets setup](#secrets--environment-variables) below.

---

---

## iOS Build (TestFlight / IPA)

**Important:** iOS builds require Apple Developer Program membership ($99/year).

### Build IPA for TestFlight

```bash
cd apps/mobile
eas build --platform ios --profile preview
# EAS handles code signing if you provide Apple credentials
```

### Required credentials

1. Apple Developer account (team ID in `eas.json` submit section)
2. iOS distribution certificate
3. App Store Connect app record (bundle: `com.signalkit.app`)
4. Provisioning profile

### TestFlight upload

```bash
eas submit --platform ios --profile production
```

### What you need in place

- Set `appleId`, `ascAppId`, `appleTeamId` in `eas.json` → `submit.production.ios`
- App Store Connect API key for automated submission

---

## GitHub Actions APK Build

**File:** `.github/workflows/mobile-apk.yml`

Trigger: manual (`workflow_dispatch`)

### Required GitHub Secrets

| Secret | Value |
|--------|-------|
| `EAS_TOKEN` | Expo access token (expo.dev → Account Settings → Access tokens) |
| `EAS_PROJECT_ID` | From Expo dashboard after `eas project:init` |

### Running the build

1. GitHub → Actions → `Mobile APK Build (Preview)` → `Run workflow`
2. Select profile: `preview` (APK) or `production` (AAB)
3. Build runs on EAS servers
4. Download from EAS dashboard or use `eas build:list`

---

## Local Dev Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy and fill env
cp apps/mobile/.env.example apps/mobile/.env
# Set EXPO_PUBLIC_API_URL=http://localhost:3000
# Set EXPO_PUBLIC_MOCK_BILLING=true  (for dev paywall)

# 3. Start API
pnpm --filter @signalkit/api dev

# 4. Start mobile
pnpm --filter @signalkit/mobile dev
# or: cd apps/mobile && expo start

# 5. Run on Android emulator
pnpm --filter @signalkit/mobile android

# 6. Run on iOS simulator (macOS only)
pnpm --filter @signalkit/mobile ios
```

---

## Required Production Packages (install when network available)

These packages are in `package.json` but couldn't be installed offline. Install when network is available:

```bash
cd apps/mobile
expo install expo-secure-store expo-haptics expo-blur
npx expo install @react-native-async-storage/async-storage
```

Then update `lib/storage.ts`, `lib/haptics.ts` as documented in their TODOs.

---

## Known Limitations

1. **Token persistence** — uses in-memory storage (resets on restart) until `expo-secure-store` is installed
2. **Onboarding persistence** — in-memory until `@react-native-async-storage/async-storage` is installed
3. **Haptics** — no-op stubs until `expo-haptics` is installed
4. **Blur effects** — simulated via opacity/backgroundColor until `expo-blur` is installed
5. **Score animations** — no animated reveal until `react-native-reanimated` / `moti` are configured
6. **Real billing** — mock mode only until RevenueCat / Expo IAP integrated (Session 16)
7. **Push notifications** — config placeholders only; backend webhook not implemented
8. **Download on mobile** — export files downloadable on web only (Share sheet integration is Session 16)
9. **Document editing** — read-only on mobile; editing is web-first

---

## Security Notes

- Never log tokens (enforced in `api.ts`)
- Never store tokens in plaintext (SecureStore when installed)
- No direct LLM/provider calls (all through backend API)
- No secrets in source code (all from `.env` / EAS secrets)
- Mock billing flag only activates in dev mode
- `google-service-account.json` must never be committed — add to `.gitignore`
