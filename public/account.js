import { clearWorkflows, loadWorkflows } from './verification.js';

const byId = (id) => document.getElementById(id);
const status = byId('session-status');
const roles = { student: 'Student', representative: 'Representative', admin: 'Platform admin' };
const workspaces = new Map([
  ['student', { title: 'Representative verification', description: 'Help students find a tutor or learning center they can trust.' }],
  ['representative', { title: 'Representative verification', description: 'Manage your verification and listing submissions.' }],
  ['admin', { title: 'Review applications', description: 'Verify representatives and review listings before they go live.' }],
]);
let currentUser = null;
let busy = false;

function setBusy(value) {
  busy = value;
  byId('logout').disabled = value;
  byId('workspace-open').disabled = value;
  for (const input of byId('verification-panel').querySelectorAll('button:not([data-blocked]), input, select, textarea')) input.disabled = value;
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
  byId('account-avatar').textContent = user?.email?.[0]?.toUpperCase() || 'T';
  byId('status').textContent = '';
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

async function openWorkspace() {
  if (busy || !workspaces.has(currentUser?.role)) return;
  const role = currentUser.role;
  setBusy(true);
  byId('workspace-panel').hidden = false;
  byId('workspace-title').textContent = workspaces.get(role).title;
  byId('workspace-description').textContent = workspaces.get(role).description;
  clearWorkflows();
  byId('workspace-counts').replaceChildren();
  byId('status').textContent = 'Loading your verification status…';
  try {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(role)}`, { credentials: 'same-origin' });
    if (response.status === 401) {
      showUser(null);
      status.textContent = 'Your session has ended. Please sign in again.';
      return;
    }
    if (response.status === 403) {
      await restoreSession();
      if (currentUser) await openWorkspace();
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
      setStatus: (message) => { byId('status').textContent = message; },
      onAccessChanged: async () => {
        await restoreSession();
        if (currentUser) await openWorkspace();
        else status.textContent = 'Your session has ended. Please sign in again.';
      },
    });
    if (currentUser?.role !== result.workspace) return;
    byId('workspace-panel').hidden = false;
    byId('status').textContent = '';
    status.textContent = '';
  } catch {
    byId('status').textContent = 'Could not load your verification status. Select Refresh status to try again.';
  } finally { setBusy(false); }
}

byId('workspace-open').addEventListener('click', openWorkspace);

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
      const item = document.createElement('div');
      item.append(name, count);
      byId('workspace-counts').append(item);
    }
  }
  byId('workspace-counts').hidden = !accounts;
}

await restoreSession();
if (currentUser) await openWorkspace();
