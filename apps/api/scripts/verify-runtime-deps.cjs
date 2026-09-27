/**
 * Load every @signalkit/* runtime dependency the way the compiled API does:
 * CommonJS require() from apps/api. The typechecker cannot prove this (it
 * resolves the "types" export condition, not the runtime one), so a package
 * whose exports map or dist/ output is unusable at runtime fails here, at build
 * time, instead of at container start.
 */
const { dependencies = {} } = require('../package.json');

const workspaceDeps = Object.keys(dependencies).filter((name) => name.startsWith('@signalkit/'));
for (const name of workspaceDeps) {
  require(name);
}
console.log(`Runtime resolution OK: ${workspaceDeps.join(', ')}`);
