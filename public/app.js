import { t } from './i18n.js';

const byId = (id) => document.getElementById(id);
function setCopy(id, key) {
  byId(id).dataset.i18n = key;
  byId(id).textContent = t(key);
}
const form = byId('auth-form');
const status = byId('status');
const loginRole = ({ '/login/representative': 'representative', '/login/admin': 'admin' })[location.pathname] || 'student';
const pages = {
  student: { title: 'flow_student_login', signup: 'flow_student_signup', description: 'flow_student_description', note: 'flow_student_note' },
  representative: { title: 'flow_representative_login', signup: 'flow_representative_signup', description: 'flow_representative_description', note: 'flow_representative_note' },
  admin: { title: 'flow_admin_login', description: 'flow_admin_description', note: 'flow_admin_note' },
};
const page = pages[loginRole];
byId('auth-modes').hidden = loginRole === 'admin';
setCopy('access-note', page.note);
for (const link of document.querySelectorAll('[data-login-role]')) {
  if (link.dataset.loginRole === loginRole) link.setAttribute('aria-current', 'page');
}
let mode = 'login';
let busy = false;

function setBusy(value) {
  busy = value;
  for (const id of ['submit', 'logout', 'login-mode', 'signup-mode']) byId(id).disabled = value;
  form.setAttribute('aria-busy', String(value));
}

function showUser(user, focus = false, created = false) {
  byId('auth-panel').hidden = Boolean(user);
  byId('session-panel').hidden = !user;
  byId('password').value = '';
  if (user) {
    byId('account-email').textContent = user.email;
    setCopy('account-role', `account_${user.role}_label`);
    const applying = user.role === 'student' && loginRole === 'representative';
    setCopy('session-title', created ? 'flow_account_created' : 'login_signed_in_title');
    setCopy('session-note', applying ? 'flow_applicant_session' : 'flow_existing_session');
    byId('account-link').href = applying ? '/account?view=verification' : '/account';
    setCopy('account-link', applying ? 'flow_continue_application' : `flow_open_${user.role}`);
    if (focus) byId('session-title').focus();
  } else if (focus) byId('email').focus();
}

function setMode(next) {
  if (busy) return;
  mode = loginRole === 'admin' ? 'login' : next;
  const signup = mode === 'signup';
  byId('login-mode').setAttribute('aria-pressed', String(!signup));
  byId('signup-mode').setAttribute('aria-pressed', String(signup));
  setCopy('form-title', signup ? page.signup : page.title);
  setCopy('form-subtitle', signup ? page.note : page.description);
  byId('access-note').hidden = signup;
  document.title = `${t(signup ? page.signup : page.title)} — TeachWiz`;
  byId('password').autocomplete = signup ? 'new-password' : 'current-password';
  byId('password').value = '';
  setCopy('submit', signup ? 'btn_create_account' : 'login_btn_signin');
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
  if ([...password].length < 8 || [...password].length > 128) {
    status.textContent = 'Use a password with 8 to 128 characters.';
    return;
  }
  setBusy(true);
  status.textContent = mode === 'signup' ? 'Creating your account…' : 'Signing you in…';
  try {
    const result = await request(mode, { email: byId('email').value, password });
    showUser(result.user, true, mode === 'signup');
    status.textContent = mode === 'signup' ? 'Student account created.' : 'You’re signed in.';
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

async function restoreSession() {
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

setMode(location.hash === '#signup' ? 'signup' : 'login');
window.addEventListener('hashchange', () => setMode(location.hash === '#signup' ? 'signup' : 'login'));
document.addEventListener('teachwiz:languagechange', () => {
  document.title = `${t(mode === 'signup' ? page.signup : page.title)} — TeachWiz`;
});
await restoreSession();
