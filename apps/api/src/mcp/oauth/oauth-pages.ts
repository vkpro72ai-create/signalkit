/** Minimal, dependency-free server-rendered HTML for the OAuth consent flow.
 * Deliberately not part of apps/web — Phase A1 must not touch web navigation. */

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:420px;margin:64px auto;padding:0 16px;color:#1a1a1a}
h1{font-size:20px}
label{display:block;margin:12px 0 4px;font-size:14px;color:#444}
input[type=email],input[type=password]{width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:14px;box-sizing:border-box}
select{width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:14px}
button{margin-top:16px;padding:10px 16px;border-radius:6px;border:none;font-size:14px;cursor:pointer}
.primary{background:#111;color:#fff}
.secondary{background:#eee;color:#111;margin-left:8px}
.scopes{background:#f6f6f6;border-radius:8px;padding:12px;margin:16px 0;font-size:13px}
.error{color:#b00020;font-size:13px;margin-top:8px}
</style></head><body>${body}</body></html>`;
}

export function loginPage(opts: { continueQuery: string; error?: string }): string {
  return shell(
    'Sign in — SignalKit',
    `<h1>Sign in to connect your AI</h1>
<form method="post" action="/oauth/login">
  <input type="hidden" name="continue" value="${escapeHtml(opts.continueQuery)}">
  <label for="email">Email</label>
  <input type="email" id="email" name="email" required autofocus>
  <label for="password">Password</label>
  <input type="password" id="password" name="password" required>
  ${opts.error ? `<div class="error">${escapeHtml(opts.error)}</div>` : ''}
  <button type="submit" class="primary">Sign in</button>
</form>`,
  );
}

export function consentPage(opts: {
  clientName: string;
  scopes: string[];
  ticket: string;
  workspaces: Array<{ id: string; name: string }>;
}): string {
  const scopeLabels: Record<string, string> = {
    'workspace:read': 'Read workspace details',
    'project:read': 'Read research contexts',
    'project:create': 'Create research contexts',
    'project:update': 'Archive/reactivate research contexts',
    'niche:read': 'Read opportunities',
    'niche:discover': 'Discover and create opportunities',
    'pack:read': 'Read Product Packs and generation status',
    'pack:edit': 'Save research notes on Product Packs',
    'pack:generate': 'Start Product Pack generation',
    'pack:approve': 'Promote a Product Pack to an implementation project',
    'comment:create': 'Set your founder verdict on opportunities',
    'export:read': 'Check export status',
    'export:create': 'Create exports',
  };
  const scopesHtml = opts.scopes.map((s) => `<div>• ${escapeHtml(scopeLabels[s] ?? s)}</div>`).join('');
  const workspaceOptions = opts.workspaces
    .map((w) => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`)
    .join('');
  return shell(
    'Connect to SignalKit',
    `<h1>${escapeHtml(opts.clientName)} wants to connect</h1>
<p>This will let it read the following from one SignalKit workspace:</p>
<div class="scopes">${scopesHtml}</div>
<form method="post" action="/oauth/consent">
  <input type="hidden" name="ticket" value="${escapeHtml(opts.ticket)}">
  <label for="workspaceId">Workspace</label>
  <select id="workspaceId" name="workspaceId" required>${workspaceOptions}</select>
  <button type="submit" name="decision" value="allow" class="primary">Allow</button>
  <button type="submit" name="decision" value="deny" class="secondary">Deny</button>
</form>`,
  );
}

export function oauthErrorPage(message: string): string {
  return shell('Connection error — SignalKit', `<h1>Can't connect</h1><p>${escapeHtml(message)}</p>`);
}
