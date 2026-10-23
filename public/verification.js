const panel = document.getElementById('verification-panel');
const types = { tutor: 'Tutor', learning_center: 'Learning center' };
let sequence = 0;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

async function api(path, body) {
  const response = await fetch(path, body === undefined ? { credentials: 'same-origin' } : {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Please try again.'), { status: response.status });
  return result;
}

function field(form, label, name, kind, max, value = '') {
  const id = `provider-field-${++sequence}`;
  const caption = node('label', label);
  caption.htmlFor = id;
  const input = node(kind === 'textarea' || kind === 'select' ? kind : 'input');
  input.id = id;
  input.name = name;
  input.required = true;
  if (max) input.maxLength = max;
  if (kind === 'select') {
    for (const [key, text] of Object.entries(types)) {
      const option = node('option', text); option.value = key; input.append(option);
    }
  }
  input.value = value || (kind === 'select' ? 'tutor' : '');
  form.append(caption, input);
  return input;
}

function button(label, value) {
  const result = node('button', label, 'primary');
  result.type = 'submit';
  if (value) result.value = value;
  return result;
}

export function clearWorkflows() { panel.replaceChildren(); }

export async function loadWorkflows(role, controls) {
  const admin = role === 'admin';
  const [verification, listingData] = await Promise.all([
    api(admin ? '/api/admin/verification' : '/api/verification'),
    api(admin ? '/api/admin/listings' : '/api/listings/mine'),
  ]);
  if (!admin && verification.verified && role !== 'representative') {
    await controls.onAccessChanged();
    return;
  }
  clearWorkflows();
  const run = async (action, message) => {
    controls.setBusy(true);
    controls.setStatus('Saving…');
    try {
      await action();
      await loadWorkflows(role, controls);
      controls.setStatus(message);
    } catch (error) {
      if (error.status === 401 || error.status === 403) await controls.onAccessChanged();
      else if (error.status === 409) await loadWorkflows(role, controls).catch(() => {});
      controls.setStatus(error instanceof TypeError ? 'Could not connect. Please try again.' : error.message);
    } finally { controls.setBusy(false); }
  };
  const refresh = button('Refresh verification and listings');
  refresh.type = 'button';
  refresh.className = 'secondary';
  refresh.addEventListener('click', () => run(async () => {}, 'Status refreshed.'));
  panel.append(refresh);

  if (admin) {
    controls.showCounts(verification.accounts);
    panel.append(node('h4', 'Representative verification'), node('p',
      'Check the contact details and supporting information independently before approving. Approval grants representative access.', 'hint'));
    for (const application of verification.applications) reviewCard(application, 'verification');
    if (!verification.applications.length) panel.append(node('p', 'No applications awaiting review.', 'empty-state'));
    panel.append(node('h4', 'Listing moderation'), node('p',
      'A listing stays private until its representative is verified and you approve the listing.', 'hint'));
    for (const listing of listingData.listings) reviewCard(listing, 'listings');
    if (!listingData.listings.length) panel.append(node('p', 'No listings awaiting review.', 'empty-state'));
    if (verification.applications.length === 100 || listingData.listings.length === 100) {
      panel.append(node('p', 'Showing the oldest 100 submissions per queue. Review these and refresh to see more.', 'hint'));
    }
    return;
  }

  const latest = verification.applications[0];
  panel.append(node('h4', 'Representative verification'), node('p',
    verification.verified ? 'Verified. You can submit listings for admin approval.'
      : latest?.status === 'pending' ? 'Your application is awaiting admin review. Your listings remain private.'
        : latest?.status === 'approved' ? 'Your account access has changed. Contact an administrator.'
          : 'Represent a tutor or learning center. An administrator will manually review your details.', 'hint'));
  for (const application of verification.applications) {
    const card = node('article', '', 'review-card');
    card.append(node('h5', application.providerName), node('p', `${types[application.providerType]} · ${application.status}`, 'badge'));
    if (application.reviewReason) card.append(node('p', `Admin note: ${application.reviewReason}`, 'submitted-text'));
    panel.append(card);
  }
  if (!latest || latest.status === 'rejected') {
    const form = node('form');
    field(form, 'Provider type', 'providerType', 'select', null, latest?.providerType);
    field(form, 'Tutor or learning center name', 'providerName', 'input', 120, latest?.providerName);
    field(form, 'Contact details for verification', 'contactDetails', 'textarea', 300, latest?.contactDetails);
    field(form, 'Your connection to the provider and supporting information', 'evidence', 'textarea', 2000, latest?.evidence);
    form.append(node('p', 'Include a public website or other details the admin can check. Do not send passwords or identity documents.', 'hint'),
      button(latest ? 'Resubmit application' : 'Submit for verification'));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      run(() => api('/api/verification/submit', Object.fromEntries(new FormData(form))), 'Application submitted for review.');
    });
    panel.append(form);
  }
  if (!latest) return;
  panel.append(node('h4', 'Your listing submissions'), node('p',
    'Submit a title and description for moderation. Both representative verification and listing approval are required before publication.', 'hint'));
  for (const listing of listingData.listings) {
    const card = node('article', '', 'review-card');
    card.append(node('h5', listing.title), node('p', listing.published ? 'Published' : `${listing.status} · Private`, 'badge'),
      node('p', listing.description, 'submitted-text'));
    if (listing.reviewReason) card.append(node('p', `Admin note: ${listing.reviewReason}`, 'submitted-text'));
    panel.append(card);
  }
  const form = node('form');
  field(form, 'Listing title', 'title', 'input', 120);
  field(form, 'Listing description', 'description', 'textarea', 2000);
  form.append(button('Submit listing for review'));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run(() => api('/api/listings/submit', Object.fromEntries(new FormData(form))), 'Listing submitted. It stays private until approved.');
  });
  panel.append(form);

  function reviewCard(item, kind) {
    const form = node('form', '', 'review-card');
    form.append(node('h5', item.providerName || item.title), node('p', item.applicantEmail, 'submitted-text'));
    if (kind === 'verification') {
      form.append(node('p', types[item.providerType], 'badge'), node('h6', 'Contact details'), node('p', item.contactDetails, 'submitted-text'),
        node('h6', 'Supporting information'), node('p', item.evidence, 'submitted-text'));
    } else {
      form.append(node('p', item.description, 'submitted-text'),
        node('p', item.representativeVerified ? 'Representative verified' : 'Representative verification required', 'badge'));
    }
    const reason = field(form, 'Review note (required when rejecting)', 'reason', 'textarea', 1000);
    reason.required = false;
    const actions = node('div', '', 'review-actions');
    const approve = button(kind === 'verification' ? 'Approve representative' : 'Approve listing', 'approved');
    if (kind === 'listings' && !item.representativeVerified) {
      approve.disabled = true;
      approve.dataset.blocked = 'true';
    }
    actions.append(approve, button('Reject', 'rejected'));
    form.append(actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const decision = event.submitter?.value;
      if (!decision) return;
      if (decision === 'rejected' && !reason.value.trim()) {
        reason.setCustomValidity('Explain what the applicant needs to correct.');
        reason.reportValidity();
        return;
      }
      run(() => api(`/api/admin/${kind}/review`, { id: item.id, decision, reason: reason.value }),
        decision === 'approved' ? 'Approved.' : 'Rejected. The applicant can see your note.');
    });
    reason.addEventListener('input', () => reason.setCustomValidity(''));
    panel.append(form);
  }
}
