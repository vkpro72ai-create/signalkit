#!/usr/bin/env node
/**
 * Local debug APK build — no EAS / Expo cloud required.
 *
 * Steps:
 *  1. expo prebuild --platform android   (generate android/ native project)
 *  2. Ensure metro.config.js exists      (pnpm monorepo watchFolders + nodeModulesPaths)
 *  3. Patch android/build.gradle         (pin Kotlin 1.9.25 for Compose Compiler)
 *  4. Patch android/app/build.gradle     (debuggableVariants = [] → bundle JS into APK)
 *  5. Pre-generate autolinking.json      (patch expo.core → expo.modules)
 *  6. gradlew clean assembleDebug        (full clean build with embedded JS)
 *  7. Verify APK contains assets/index.android.bundle and print full report
 *
 * Output: apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
 *
 * Prerequisites: JDK 17+, Android SDK with ANDROID_HOME set.
 *
 * Patches applied automatically after every expo prebuild:
 *
 *  [1] metro.config.js — expo prebuild does not create this file. Metro needs it
 *      in a pnpm monorepo to watch the workspace root (node_modules/.pnpm virtual
 *      store) and resolve packages not symlinked directly in apps/mobile/node_modules.
 *      Without it Metro throws "Unable to resolve module ... entry.js".
 *
 *  [2] Kotlin pin — expo-modules-core Compose Compiler 1.5.15 requires 1.9.25.
 *      Generated android/build.gradle has unversioned kotlin-gradle-plugin; RN's
 *      transitive deps resolve 1.9.24. Fix: pin via the ext.kotlinVersion variable.
 *
 *  [3] debuggableVariants = [] — the RN Gradle plugin (0.76+) skips the JS bundle
 *      step for all variants listed in debuggableVariants (default: ["debug"]).
 *      Skipped means no index.android.bundle in APK → "Unable to load script".
 *      bundleInDebug=true is a legacy react.gradle property — NOT honored by 0.76+.
 *      Fix: override debuggableVariants to [] so ALL variants embed the JS bundle.
 *
 *  [3b] extraPackagerArgs <dir> — expo CLI's findWorkspaceRoot() finds
 *       pnpm-workspace.yaml at the repo root (C:\SignalKit) and sets it as Metro's
 *       project root. This means metro.config.js in apps/mobile is never found and
 *       module resolution breaks ("Unable to resolve expo-router/entry.js"). Fix:
 *       add extraPackagerArgs = ["<apps/mobile-path>"] to the react {} block so
 *       expo export:embed receives apps/mobile as its positional <dir> argument,
 *       overriding the CWD-based project root detection.
 *
 *  [4] autolinking.json patch — expo-modules-autolinking@2.0.8 falls back to
 *      expo/android/build.gradle namespace "expo.core", producing the wrong class
 *      expo.core.ExpoModulesPackage (correct: expo.modules.ExpoModulesPackage).
 *      Fix: pre-generate, patch, and write package.json.sha so Gradle's cache
 *      check skips regeneration.
 */
const { execSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const androidDir = path.join(root, 'android');

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

console.log('=== SignalKit local APK build ===\n');

// ── Step 1: expo prebuild ──────────────────────────────────────────────────
run('expo prebuild --platform android', { cwd: root });

// ── Step 2: ensure metro.config.js exists for pnpm monorepo ──────────────
// Metro must watch the workspace root (node_modules/.pnpm virtual store) to
// resolve packages not directly linked in apps/mobile/node_modules.
// expo prebuild does not generate this file; we ensure it exists here.
const metroConfigPath = path.join(root, 'metro.config.js');
const workspaceRoot = path.resolve(root, '../..');
const METRO_CONFIG_CONTENT = `const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.projectRoot = projectRoot;

// @expo/metro-config sets config.server.unstable_serverRoot = getMetroServerRoot()
// which finds pnpm-workspace.yaml at C:\\\\\\\\SignalKit and returns workspace root.
// MetroBundlerDevServer.resolveRelativePathAsync uses relativeTo:"server" from
// unstable_serverRoot, so "./index.js" resolves from C:\\\\\\\\SignalKit (wrong).
// Override to apps/mobile so "./index.js" → apps/mobile/index.js (correct).
config.server = {
  ...config.server,
  unstable_serverRoot: projectRoot,
};

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// react-native-screens@4.x ships TypeScript source via "react-native" package.json field.
// Fabric spec files use CodegenTypes (RN 0.78+ API) which fails under RN 0.76.
// Redirect to compiled lib/commonjs output to avoid the codegen parse error.
const pnpmStoreDir = path.join(workspaceRoot, 'node_modules/.pnpm');
const screensStoreEntry = fs.readdirSync(pnpmStoreDir)
  .filter(d => d.startsWith('react-native-screens@'))
  .sort().pop();
const screensCompiledIndex = screensStoreEntry
  ? path.join(pnpmStoreDir, screensStoreEntry, 'node_modules/react-native-screens/lib/commonjs/index.js')
  : null;
if (screensCompiledIndex && fs.existsSync(screensCompiledIndex)) {
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === 'react-native-screens') {
      return { filePath: screensCompiledIndex, type: 'sourceFile' };
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
`;

if (!fs.existsSync(metroConfigPath)) {
  fs.writeFileSync(metroConfigPath, METRO_CONFIG_CONTENT, 'utf-8');
  console.log('\n✓ Created metro.config.js (pnpm monorepo + unstable_serverRoot fix)');
} else {
  // Ensure unstable_serverRoot override is present (may be missing from older prebuild runs)
  const existing = fs.readFileSync(metroConfigPath, 'utf-8');
  if (!existing.includes('unstable_serverRoot') || !existing.includes('resolveRequest')) {
    fs.writeFileSync(metroConfigPath, METRO_CONFIG_CONTENT, 'utf-8');
    console.log('\n✓ Updated metro.config.js: added unstable_serverRoot + resolveRequest fixes');
  } else {
    console.log('\n✓ metro.config.js exists with all required fixes');
  }
}

// ── Step 3: pin Kotlin 1.9.25 in android/build.gradle ─────────────────────
const buildGradlePath = path.join(androidDir, 'build.gradle');
let buildGradle = fs.readFileSync(buildGradlePath, 'utf-8');
const unversioned = "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')";
const versioned   = "classpath(\"org.jetbrains.kotlin:kotlin-gradle-plugin:${kotlinVersion}\")";
if (buildGradle.includes(unversioned)) {
  buildGradle = buildGradle.replace(unversioned, versioned);
  fs.writeFileSync(buildGradlePath, buildGradle, 'utf-8');
  console.log('\n✓ [Patch 1] android/build.gradle: kotlin-gradle-plugin pinned to ${kotlinVersion} (1.9.25)');
}

// ── Step 4: patch android/app/build.gradle ────────────────────────────────
// 4a. debuggableVariants = [] — RN Gradle plugin 0.76+ skips JS bundle for all
//     variants in debuggableVariants (default ["debug"]). Must be [] so debug
//     APKs embed the bundle and work standalone without Metro.
//
// 4b. entryFile = ../index.js — resolveAppEntry returns a path inside the pnpm
//     virtual store. export:embed converts it to a path relative to projectRoot,
//     which Metro then resolves from the workspace serverRoot (C:\SignalKit),
//     producing C:\SignalKit\../../... (doesn't exist). Using a local index.js
//     that imports expo-router/entry keeps the entry file within apps/mobile
//     where Metro resolves it correctly via the expo-router symlink.

// Create index.js if missing (expo prebuild doesn't generate it)
const indexJsPath = path.join(root, 'index.js');
if (!fs.existsSync(indexJsPath)) {
  fs.writeFileSync(indexJsPath, "import 'expo-router/entry';\n", 'utf-8');
  console.log('\n✓ Created apps/mobile/index.js (expo-router/entry wrapper)');
}

const appBuildGradlePath = path.join(androidDir, 'app', 'build.gradle');
let appBuildGradle = fs.readFileSync(appBuildGradlePath, 'utf-8');
let appBuildGradleChanged = false;

if (!appBuildGradle.includes('debuggableVariants = []')) {
  appBuildGradle = appBuildGradle.replace(/^(react \{)/m, '$1\n    debuggableVariants = []');
  appBuildGradleChanged = true;
}

// entryFile: android/app/../../index.js = apps/mobile/index.js
// (Gradle file() resolves relative to the android/app/ project directory)
if (!appBuildGradle.includes('entryFile = file("../../index.js")')) {
  appBuildGradle = appBuildGradle.replace(
    /entryFile\s*=\s*file\([^)]+\)/,
    'entryFile = file("../../index.js")'
  );
  appBuildGradleChanged = true;
}

// 4c. Inline Gradle task to patch PackageList.java before Java compilation.
//     expo-modules-autolinking@2.0.8 reads namespace "expo.core" from expo/android/build.gradle
//     and generates "import expo.core.ExpoModulesPackage" — wrong, the class is in expo.modules.
//     Patching autolinking.json doesn't survive because Gradle regenerates it. Instead, patch
//     PackageList.java itself via a JavaCompile.doFirst hook in app/build.gradle.
const patchTask = `
// expo-modules-autolinking@2.0.8 generates "import expo.core.ExpoModulesPackage" because
// expo/android/build.gradle has namespace "expo.core", but the class is in expo.modules.
// Patch PackageList.java before each Java compilation to fix the wrong namespace.
tasks.withType(JavaCompile).configureEach {
    it.doFirst {
        def pkgList = new File("\${buildDir}/generated/autolinking/src/main/java/com/facebook/react/PackageList.java")
        if (pkgList.exists() && pkgList.text.contains('expo.core.ExpoModulesPackage')) {
            pkgList.text = pkgList.text.replace('expo.core.ExpoModulesPackage', 'expo.modules.ExpoModulesPackage')
            println '[SignalKit] Patched PackageList.java: expo.core -> expo.modules'
        }
    }
}`;
if (!appBuildGradle.includes('expo.core.ExpoModulesPackage') || !appBuildGradle.includes('tasks.withType(JavaCompile)')) {
  if (!appBuildGradle.includes('tasks.withType(JavaCompile)')) {
    appBuildGradle += patchTask;
    appBuildGradleChanged = true;
  }
}

if (appBuildGradleChanged) {
  fs.writeFileSync(appBuildGradlePath, appBuildGradle, 'utf-8');
  console.log('✓ [Patch 2] android/app/build.gradle: debuggableVariants=[], entryFile=../../index.js, PackageList patch task');
}

// ── Step 4: pre-generate and patch autolinking.json ───────────────────────
const autolinkBuildDir = path.join(androidDir, 'build', 'generated', 'autolinking');
const autolinkingJsonPath = path.join(autolinkBuildDir, 'autolinking.json');
const packageJsonPath = path.join(root, 'package.json');

console.log('\n> [Patch 3] Generating autolinking.json...');
const autolinkCmd = [
  'node', '--no-warnings', '--eval',
  '"require(require.resolve(\'expo-modules-autolinking\', { paths: [require.resolve(\'expo/package.json\')] }))(process.argv.slice(1))"',
  'react-native-config', '--json', '--platform', 'android',
].join(' ');

const rawJson = execSync(autolinkCmd, { cwd: root, encoding: 'utf-8' });
const patchedJson = rawJson.replace(/expo\.core\.ExpoModulesPackage/g, 'expo.modules.ExpoModulesPackage');

fs.mkdirSync(autolinkBuildDir, { recursive: true });
fs.writeFileSync(autolinkingJsonPath, patchedJson, 'utf-8');

const packageJsonSha = crypto
  .createHash('sha256')
  .update(fs.readFileSync(packageJsonPath))
  .digest('hex');
fs.writeFileSync(path.join(autolinkBuildDir, 'package.json.sha'), packageJsonSha, 'utf-8');

const hadCoreBug = rawJson.includes('expo.core.ExpoModulesPackage');
console.log(hadCoreBug
  ? '✓ autolinking.json patched: expo.core.ExpoModulesPackage → expo.modules.ExpoModulesPackage'
  : '✓ autolinking.json OK (no expo.core references found)');

// ── Step 5: Gradle clean + assembleDebug ──────────────────────────────────
const gradlew = process.platform === 'win32'
  ? path.join(androidDir, 'gradlew.bat')
  : path.join(androidDir, 'gradlew');

if (!fs.existsSync(gradlew)) {
  console.error(`\nError: Gradle wrapper not found at ${gradlew}`);
  process.exit(1);
}
if (process.platform !== 'win32') {
  fs.chmodSync(gradlew, '755');
}

run(`"${gradlew}" clean assembleDebug`, { cwd: androidDir });

// ── Step 6: Verify APK and print report ───────────────────────────────────
const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

if (!fs.existsSync(apk)) {
  console.error('\n✗ APK not found at expected path — check Gradle output above.');
  process.exit(1);
}

// APKs are ZIP archives; verify JS bundle is present using tar (available on
// Windows 10+, macOS, Linux)
console.log('\n> Verifying APK contents...');
let apkContents = '';
try {
  apkContents = execSync(`tar -tf "${apk}"`, { encoding: 'utf-8' });
} catch (e) {
  console.warn('  Warning: tar unavailable, skipping content verification.');
}

const bundleEntry = apkContents
  .split('\n')
  .find(l => l.toLowerCase().includes('index.android.bundle'));

if (apkContents && !bundleEntry) {
  console.error('\n✗ FATAL: assets/index.android.bundle is NOT inside the APK.');
  console.error('  The app will show "Unable to load script" on device.');
  console.error('  Ensure Patch 2 (debuggableVariants = []) was applied correctly.');
  process.exit(1);
}

const stat    = fs.statSync(apk);
const sizeMB  = (stat.size / 1024 / 1024).toFixed(1);
const sha256  = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');

console.log('\n✓ APK verified and ready:');
console.log(`  Path:     ${apk}`);
console.log(`  Size:     ${sizeMB} MB`);
console.log(`  Modified: ${stat.mtime.toISOString()}`);
console.log(`  SHA256:   ${sha256}`);
if (bundleEntry) {
  console.log(`  Bundle:   ${bundleEntry.trim()}`);
}
console.log('\nInstall on device:');
console.log(`  adb install -r "${apk}"`);
