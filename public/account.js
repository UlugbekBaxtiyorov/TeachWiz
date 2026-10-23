const byId = (id) => document.getElementById(id);
const status = byId('status');
const roles = { student: 'Student', representative: 'Representative', admin: 'Platform admin' };

function showUser(user) {
  byId('signed-in').hidden = !user;
  byId('signed-out').hidden = Boolean(user);
  if (user) {
    byId('account-email').textContent = user.email;
    byId('account-role').textContent = roles[user.role] || 'Account';
  }
}

byId('logout').addEventListener('click', async () => {
  byId('logout').disabled = true;
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
  } finally { byId('logout').disabled = false; }
});

try {
  const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
  if (response.ok) showUser((await response.json()).user);
  else if (response.status === 401) showUser(null);
  else throw new Error('Session check failed.');
} catch {
  showUser(null);
  status.textContent = 'Could not check your session. Please try signing in.';
}
