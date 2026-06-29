const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.projectRoot = projectRoot;

// @expo/metro-config sets config.server.unstable_serverRoot = getMetroServerRoot()
// which walks up from apps/mobile and finds pnpm-workspace.yaml at C:\SignalKit,
// returning C:\SignalKit as the server root. MetroBundlerDevServer.resolveRelativePathAsync
// uses relativeTo:"server" which resolves module paths from unstable_serverRoot.
// So "./index.js" is resolved from C:\SignalKit → C:\SignalKit/index.js (doesn't exist).
// Override to apps/mobile so "./index.js" → apps/mobile/index.js (exists).
config.server = {
  ...config.server,
  unstable_serverRoot: projectRoot,
};

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// react-native-screens@4.x ships TypeScript source files via its "react-native" package.json
// field (src/index). These Fabric component specs use CodegenTypes (RN 0.78+ API) which
// @react-native/babel-plugin-codegen fails to parse under RN 0.76. Redirect to the compiled
// lib/commonjs output so Metro never loads the incompatible TypeScript source.
const pnpmStoreDir = path.join(workspaceRoot, 'node_modules/.pnpm');
const screensStoreEntry = fs.readdirSync(pnpmStoreDir)
  .filter(d => d.startsWith('react-native-screens@'))
  .sort()
  .pop();
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
