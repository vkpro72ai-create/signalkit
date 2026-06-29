const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.projectRoot = projectRoot;

// @expo/metro-config discovers the pnpm workspace root and uses it as the
// Metro server root, which makes "./index.js" resolve from the monorepo root.
// Force the server root back to apps/mobile so embedded debug bundles resolve
// the Expo Router entry correctly.
config.server = {
  ...config.server,
  unstable_serverRoot: projectRoot,
};

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
