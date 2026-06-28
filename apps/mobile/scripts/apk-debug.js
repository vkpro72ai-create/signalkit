#!/usr/bin/env node
/**
 * Local debug APK build — no EAS / Expo cloud required.
 *
 * Steps:
 *  1. expo prebuild --platform android   (generate android/ native project)
 *  2. Patch android/build.gradle         (pin Kotlin 1.9.25 for expo-modules-core)
 *  3. Pre-generate autolinking.json      (and patch expo.core → expo.modules bug)
 *  4. gradlew assembleDebug              (compile and package APK)
 *
 * Output: apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
 *
 * Prerequisites: JDK 17+, Android SDK with ANDROID_HOME set.
 *
 * Known issues patched here:
 *  - expo-modules-autolinking@2.0.8 falls back to expo.core (build.gradle namespace)
 *    instead of expo.modules when react-native.config.js packageImportPath is not
 *    picked up correctly. We pre-generate and patch autolinking.json before Gradle runs.
 *  - Kotlin 1.9.24 is resolved transitively from RN; expo-modules-core Compose Compiler
 *    1.5.15 needs 1.9.25. We pin it explicitly in build.gradle.
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

// ── Step 2: pin Kotlin version in android/build.gradle ────────────────────
// expo-modules-core Compose Compiler 1.5.15 requires Kotlin 1.9.25.
// The generated build.gradle has no version on kotlin-gradle-plugin, so RN's
// transitive deps resolve 1.9.24. Pin it via the ext.kotlinVersion variable.
const buildGradlePath = path.join(androidDir, 'build.gradle');
let buildGradle = fs.readFileSync(buildGradlePath, 'utf-8');
const unversioned = "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')";
const versioned   = "classpath(\"org.jetbrains.kotlin:kotlin-gradle-plugin:${kotlinVersion}\")";
if (buildGradle.includes(unversioned)) {
  buildGradle = buildGradle.replace(unversioned, versioned);
  fs.writeFileSync(buildGradlePath, buildGradle, 'utf-8');
  console.log('\n✓ Patched android/build.gradle: Kotlin pinned to ${kotlinVersion} (→ 1.9.25)');
}

// ── Step 3: pre-generate and patch autolinking.json ───────────────────────
// ReactSettingsExtension runs this command during Gradle settings phase and
// caches the result. By writing the patched JSON + SHA before Gradle starts,
// the settings phase sees a valid cache and skips regeneration.
//
// Bug: expo-modules-autolinking@2.0.8 reads expo/android/build.gradle
// namespace "expo.core" as fallback, generating "expo.core.ExpoModulesPackage".
// The correct class is expo.modules.ExpoModulesPackage (per react-native.config.js
// and the actual Kotlin source). We patch the JSON before Gradle consumes it.
const autolinkBuildDir = path.join(androidDir, 'build', 'generated', 'autolinking');
const autolinkingJsonPath = path.join(autolinkBuildDir, 'autolinking.json');
const packageJsonPath = path.join(root, 'package.json');

console.log('\n> Generating autolinking.json (expo-modules-autolinking react-native-config)...');
const autolinkCmd = [
  'node', '--no-warnings', '--eval',
  '"require(require.resolve(\'expo-modules-autolinking\', { paths: [require.resolve(\'expo/package.json\')] }))(process.argv.slice(1))"',
  'react-native-config', '--json', '--platform', 'android',
].join(' ');

const rawJson = execSync(autolinkCmd, { cwd: root, encoding: 'utf-8' });
const patched = rawJson.replace(/expo\.core\.ExpoModulesPackage/g, 'expo.modules.ExpoModulesPackage');

fs.mkdirSync(autolinkBuildDir, { recursive: true });
fs.writeFileSync(autolinkingJsonPath, patched, 'utf-8');

// Write SHA so Gradle's isCacheDirty() returns false (uses our patched JSON, not regenerating)
const packageJsonSha = crypto
  .createHash('sha256')
  .update(fs.readFileSync(packageJsonPath))
  .digest('hex');
fs.writeFileSync(path.join(autolinkBuildDir, 'package.json.sha'), packageJsonSha, 'utf-8');

const wasPatched = rawJson.includes('expo.core.ExpoModulesPackage');
console.log(wasPatched
  ? '✓ Patched autolinking.json: expo.core.ExpoModulesPackage → expo.modules.ExpoModulesPackage'
  : '✓ autolinking.json looks correct (no expo.core references found)');

// ── Step 4: Gradle build ───────────────────────────────────────────────────
const gradlew = process.platform === 'win32'
  ? path.join(androidDir, 'gradlew.bat')
  : path.join(androidDir, 'gradlew');

if (!fs.existsSync(gradlew)) {
  console.error(`Gradle wrapper not found at ${gradlew}`);
  process.exit(1);
}

if (process.platform !== 'win32') {
  fs.chmodSync(gradlew, '755');
}

run(`"${gradlew}" assembleDebug`, { cwd: androidDir });

// ── Done ──────────────────────────────────────────────────────────────────
const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (fs.existsSync(apk)) {
  const sizeMB = (fs.statSync(apk).size / 1024 / 1024).toFixed(1);
  console.log(`\n✓ APK ready (${sizeMB} MB):`);
  console.log(`  ${apk}`);
} else {
  console.error('\n✗ APK not found — check Gradle output above.');
  process.exit(1);
}
