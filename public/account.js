import { clearWorkflows, loadWorkflows } from './verification.js';

const byId = (id) => document.getElementById(id);
const status = byId('status');
const roles = { student: 'Student', representative: 'Representative', admin: 'Platform admin' };
const workspaces = new Map([
  ['student', { title: 'Student workspace', description: 'You are signed in with a student account.' }],
  ['representative', { title: 'Representative workspace', description: 'You are signed in with a representative account. Listing approval is managed separately.' }],
  ['admin', { title: 'Platform administration', description: 'Account totals across the platform.' }],
]);
let currentUser = null;
let busy = false;

function setBusy(value) {
  busy = value;
  byId('logout').disabled = value;
  byId('workspace-open').disabled = value;
  for (const button of byId('verification-panel').querySelectorAll('button:not([data-blocked])')) button.disabled = value;
  byId('signed-in').setAttribute('aria-busy', String(value));
}

function showUser(user) {
  currentUser = user;
  clearWorkflows();
  byId('workspace-panel').hidden = true;
  byId('workspace-title').textContent = '';
  byId('workspace-description').textContent = '';
  byId('workspace-counts').replaceChildren();
  byId('workspace-counts').hidden = true;
  byId('workspace-open').hidden = !workspaces.has(user?.role);
  byId('signed-in').hidden = !user;
  byId('signed-out').hidden = Boolean(user);
  byId('account-email').textContent = user?.email || '';
  byId('account-role').textContent = user ? roles[user.role] || 'Account' : '';
}

byId('logout').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: '{}',
    });
    if (!response.ok) throw new Error('Logout failed.');
    showUser(null);
    status.textContent = 'You’ve signed out.';
  } catch {
    status.textContent = 'Could not sign out. Please try again.';
  } finally { setBusy(false); }
});

byId('workspace-open').addEventListener('click', async () => {
  if (busy || !workspaces.has(currentUser?.role)) return;
  const role = currentUser.role;
  setBusy(true);
  byId('workspace-panel').hidden = true;
  byId('workspace-counts').replaceChildren();
  status.textContent = 'Opening your workspace…';
  try {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(role)}`, { credentials: 'same-origin' });
    if (response.status === 401) {
      showUser(null);
      status.textContent = 'Your session has ended. Please sign in again.';
      return;
    }
    if (response.status === 403) {
      await restoreSession();
      status.textContent = 'Your access has changed. Your account has been refreshed.';
      return;
    }
    if (!response.ok) throw new Error('Workspace request failed.');
    const result = await response.json();
    const details = workspaces.get(result.workspace);
    if (!details) throw new Error('Unknown workspace.');
    byId('workspace-title').textContent = details.title;
    byId('workspace-description').textContent = details.description;
    showCounts(result.accounts);
    await loadWorkflows(result.workspace, {
      setBusy,
      showCounts,
      setStatus: (message) => { status.textContent = message; },
      onAccessChanged: async () => {
        await restoreSession();
        status.textContent = 'Your access has changed. Open your workspace to continue.';
      },
    });
    if (currentUser?.role !== result.workspace) return;
    byId('workspace-panel').hidden = false;
    byId('workspace-title').focus();
    status.textContent = '';
  } catch {
    status.textContent = 'Could not open your workspace. Please try again.';
  } finally { setBusy(false); }
});

async function restoreSession() {
  showUser(null);
  setBusy(true);
  try {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
    if (response.ok) showUser((await response.json()).user);
    else if (response.status === 401) showUser(null);
    else throw new Error('Session check failed.');
  } catch {
    status.textContent = 'Could not check your session. Please try signing in.';
  } finally { setBusy(false); }
}

function showCounts(accounts) {
  byId('workspace-counts').replaceChildren();
  if (accounts) {
    for (const [key, label] of [['student', 'Students'], ['representative', 'Representatives'], ['admin', 'Admins']]) {
      const name = document.createElement('dt');
      const count = document.createElement('dd');
      name.textContent = label;
      count.textContent = String(accounts[key]);
      byId('workspace-counts').append(name, count);
    }
  }
  byId('workspace-counts').hidden = !accounts;
}

await restoreSession();
