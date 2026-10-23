const byId = (id) => document.getElementById(id);
const form = byId('auth-form');
const status = byId('status');
let mode = 'login';
let busy = false;
let currentUser = null;
const workspaces = new Map([
  ['student', { title: 'Student workspace', description: 'You are signed in with a student account.' }],
  ['representative', { title: 'Representative workspace', description: 'You are signed in with a representative account. Listing approval is managed separately.' }],
  ['admin', { title: 'Platform administration', description: 'Account totals across the platform.' }],
]);

function setBusy(value) {
  busy = value;
  for (const id of ['submit', 'logout', 'login-mode', 'signup-mode', 'workspace-open']) byId(id).disabled = value;
  form.setAttribute('aria-busy', String(value));
}

function showUser(user, focus = false) {
  currentUser = user;
  byId('workspace-panel').hidden = true;
  byId('workspace-title').textContent = '';
  byId('workspace-description').textContent = '';
  byId('workspace-counts').replaceChildren();
  byId('workspace-counts').hidden = true;
  byId('workspace-open').hidden = !workspaces.has(user?.role);
  byId('auth-panel').hidden = Boolean(user);
  byId('session-panel').hidden = !user;
  byId('password').value = '';
  if (user) {
    byId('account-email').textContent = user.email;
    byId('account-role').textContent = { student: 'Student', representative: 'Representative', admin: 'Platform admin' }[user.role] || 'Account';
    if (focus) byId('session-title').focus();
  } else if (focus) byId('email').focus();
}

function setMode(next) {
  if (busy) return;
  mode = next;
  const signup = mode === 'signup';
  byId('login-mode').setAttribute('aria-pressed', String(!signup));
  byId('signup-mode').setAttribute('aria-pressed', String(signup));
  byId('form-title').textContent = signup ? 'Start your chapter.' : 'Welcome back.';
  byId('form-subtitle').textContent = signup ? 'Create your student account and take the first step.' : 'Sign in and pick up where you left off.';
  byId('password').autocomplete = signup ? 'new-password' : 'current-password';
  byId('password').value = '';
  byId('submit').firstChild.textContent = signup ? 'Create account ' : 'Sign in ';
  status.textContent = '';
}

async function request(path, body) {
  const response = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.error || 'Please try again.');
  return result;
}

byId('login-mode').addEventListener('click', () => setMode('login'));
byId('signup-mode').addEventListener('click', () => setMode('signup'));
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const password = byId('password').value;
  if ([...password].length < 15 || [...password].length > 128) {
    status.textContent = 'Use a password with 15 to 128 characters.';
    return;
  }
  setBusy(true);
  status.textContent = mode === 'signup' ? 'Creating your account…' : 'Signing you in…';
  try {
    const result = await request(mode, { email: byId('email').value, password });
    showUser(result.user, true);
    status.textContent = 'You’re signed in.';
  } catch (error) {
    byId('password').value = '';
    status.textContent = error instanceof TypeError ? 'Could not connect. Please try again.' : error.message;
  } finally { setBusy(false); }
});
byId('logout').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  try {
    await request('logout', {});
    showUser(null, true);
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
      showUser(null, true);
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
    if (result.accounts) {
      for (const [key, label] of [['student', 'Students'], ['representative', 'Representatives'], ['admin', 'Admins']]) {
        const name = document.createElement('dt');
        const count = document.createElement('dd');
        name.textContent = label;
        count.textContent = String(result.accounts[key]);
        byId('workspace-counts').append(name, count);
      }
    }
    byId('workspace-counts').hidden = !result.accounts;
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

await restoreSession();
