import { clearWorkflows, loadWorkflows } from './verification.js';
import { t } from './i18n.js';

const byId = (id) => document.getElementById(id);
const status = byId('session-status');
function setCopy(id, key) {
  byId(id).dataset.i18n = key;
  byId(id).textContent = t(key);
}
const workspaces = new Map([
  ['student', { title: 'flow_student_dashboard', description: 'flow_student_dashboard_description' }],
  ['representative', { title: 'flow_representative_dashboard', description: 'flow_representative_dashboard_description' }],
  ['admin', { title: 'flow_admin_dashboard', description: 'flow_admin_dashboard_description' }],
]);
const teachingView = new URLSearchParams(location.search).get('view') === 'verification';
if (teachingView) {
  byId('account-login').href = '/login/representative';
  byId('account-signup').href = '/login/representative#signup';
}
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
  byId('student-home').hidden = true;
  byId('workspace-panel').hidden = true;
  byId('workspace-title').textContent = '';
  byId('workspace-description').textContent = '';
  byId('workspace-counts').replaceChildren();
  byId('workspace-counts').hidden = true;
  byId('workspace-open').hidden = !workspaces.has(user?.role);
  byId('signed-in').hidden = !user;
  byId('signed-out').hidden = Boolean(user);
  byId('account-email').textContent = user?.email || '';
  setCopy('account-role', user ? `account_${user.role}_label` : 'account_title');
  setCopy('account-title', user ? `flow_${user.role}_account` : 'account_title');
  document.title = `${byId('account-title').textContent} — TeachWiz`;
  const links = user?.role === 'admin' ? [['flow_review_queue', '/account']]
    : user?.role === 'representative' ? [['account_verification_link', '/account'], ['flow_browse_catalog', '/search']]
    : [['flow_student_dashboard', '/account'], ['flow_find_providers', '/search'], ['flow_teaching_application', '/account?view=verification']];
  byId('account-shortcuts').replaceChildren();
  for (const [label, href] of links) {
    const link = document.createElement('a');
    link.dataset.i18n = label; link.dataset.noI18n = ''; link.textContent = t(label); link.href = href;
    if (href === `/account${user?.role === 'student' && teachingView ? '?view=verification' : ''}`) link.setAttribute('aria-current', 'page');
    byId('account-shortcuts').append(link);
  }
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
  setCopy('workspace-title', workspaces.get(role).title);
  setCopy('workspace-description', workspaces.get(role).description);
  clearWorkflows();
  byId('student-home').hidden = true;
  byId('workspace-counts').replaceChildren();
  byId('status').textContent = 'Loading your dashboard…';
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
    if (result.user.role !== currentUser?.role) {
      showUser(result.user);
    }
    const details = workspaces.get(result.workspace);
    if (!details) throw new Error('Unknown workspace.');
    setCopy('workspace-title', details.title);
    setCopy('workspace-description', details.description);
    showCounts(result.accounts);
    if (result.workspace === 'student' && !teachingView) {
      byId('student-home').hidden = false;
      byId('workspace-panel').hidden = false;
      byId('status').textContent = '';
      status.textContent = '';
      return;
    }
    if (result.workspace === 'student') {
      setCopy('workspace-title', 'flow_your_application');
      setCopy('workspace-description', 'flow_application_note');
    }
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
    byId('status').textContent = 'Could not load your dashboard. Select Refresh status to try again.';
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

document.addEventListener('teachwiz:languagechange', () => {
  document.title = `${byId('account-title').textContent} — TeachWiz`;
});
await restoreSession();
if (currentUser) await openWorkspace();
