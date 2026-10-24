const panel = document.getElementById('verification-panel');
const types = { tutor: 'Tutor', learning_center: 'Learning center' };
const statusLabels = { pending: 'In review', approved: 'Verified', rejected: 'Changes requested' };
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

function field(form, label, name, kind, max, value = '', hint = '') {
  const id = `provider-field-${++sequence}`;
  const wrapper = node('div', '', 'verification-field');
  const caption = node('label', label);
  caption.htmlFor = id;
  const input = node(kind === 'textarea' || kind === 'select' ? kind : 'input');
  input.id = id;
  input.name = name;
  input.required = true;
  if (max) input.maxLength = max;
  if (kind === 'textarea') input.rows = name === 'contactDetails' ? 2 : 4;
  if (kind === 'select') {
    for (const [key, text] of Object.entries(types)) {
      const option = node('option', text); option.value = key; input.append(option);
    }
  }
  input.value = value || (kind === 'select' ? 'tutor' : '');
  wrapper.append(caption, input);
  if (hint) {
    const help = node('p', hint, 'field-hint');
    help.id = `${id}-hint`;
    input.setAttribute('aria-describedby', help.id);
    wrapper.append(help);
  }
  form.append(wrapper);
  return input;
}

function button(label, value, className = 'btn btn-primary') {
  const result = node('button', label, className);
  result.type = 'submit';
  if (value) result.value = value;
  return result;
}

function badge(label, tone = 'neutral') { return node('span', label, `status-badge status-${tone}`); }

function section(title, description) {
  const result = node('section', '', 'workflow-section');
  const heading = node('h3', title);
  heading.id = `workflow-heading-${++sequence}`;
  result.setAttribute('aria-labelledby', heading.id);
  result.append(heading, node('p', description, 'workflow-description'));
  return result;
}

function dateLabel(timestamp) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(timestamp));
}

function providerHeading(item, title, label, tone) {
  const heading = node('div', '', 'provider-heading');
  const initials = title.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const avatar = node('span', initials, 'provider-avatar');
  avatar.setAttribute('aria-hidden', 'true');
  const info = node('div', '', 'provider-info');
  info.append(node('h4', title), badge(label, tone));
  if (item.providerType) info.append(node('p', types[item.providerType], 'muted'));
  heading.append(avatar, info);
  return heading;
}

function reviewNote(reason) {
  const note = node('div', '', 'review-note');
  note.append(node('p', 'Note from the review team', 'field-label'), node('p', reason, 'submitted-text'));
  return note;
}

function submittedDetails(application) {
  const details = node('details', '', 'submission-details');
  details.append(node('summary', 'View submitted details'));
  for (const [label, text] of [['Contact details', application.contactDetails], ['Supporting information', application.evidence]]) {
    details.append(node('p', label, 'field-label'), node('p', text, 'submitted-text'));
  }
  details.append(node('p', `Submitted ${dateLabel(application.submittedAt)}`, 'field-hint'));
  return details;
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
  let saving = false;
  const run = async (action, message) => {
    if (saving) return;
    saving = true;
    controls.setBusy(true);
    controls.setStatus('Saving…');
    try {
      await action();
      await loadWorkflows(role, controls);
      controls.setStatus(message);
      document.getElementById('status').focus();
    } catch (error) {
      if (error.status === 401 || error.status === 403) await controls.onAccessChanged();
      else if (error.status === 409) await loadWorkflows(role, controls).catch(() => {});
      controls.setStatus(error instanceof TypeError ? 'Could not connect. Please try again.' : error.message);
    } finally { saving = false; controls.setBusy(false); }
  };

  if (admin) {
    controls.showCounts(verification.accounts);
    const queues = node('div', '', 'review-queues');
    for (const [kind, title, description, items] of [
      ['verification', 'Representative applications', 'Check the contact details and supporting information before granting representative access.', verification.applications],
      ['listings', 'Listing approvals', 'Publish a listing only after its representative has been verified.', listingData.listings],
    ]) {
      const queue = section(title, description);
      queue.querySelector('h3').append(node('span', String(items.length), 'queue-count'));
      for (const item of items) queue.append(reviewCard(item, kind));
      if (!items.length) {
        const empty = node('div', '', 'panel workflow-empty');
        empty.append(node('h4', 'You’re all caught up'), node('p', 'New submissions will appear here. Use Refresh status to check again.', 'muted'));
        queue.append(empty);
      }
      if (items.length === 100) queue.append(node('p', 'Showing the oldest 100 submissions. Review these and refresh to see more.', 'field-hint'));
      queues.append(queue);
    }
    panel.append(queues);
    return;
  }

  const latest = verification.applications[0];
  const state = verification.verified ? 'approved' : latest?.status === 'approved' ? 'restricted' : latest?.status || 'new';
  const states = {
    new: ['Not submitted', 'Get verified on Teachwiz', 'Tell us about the tutor or learning center you represent. Our team will check your details before granting representative access.'],
    pending: ['In review', 'Your application is with our team', 'We’ll review your connection to the provider. You can submit a listing while you wait, but it stays private until both approvals are complete.'],
    approved: ['Verified', 'You’re a verified representative', 'Your details have been approved. Submit a listing for a separate review before students can see it.'],
    rejected: ['Changes requested', 'A few details need your attention', 'Read the review note below, update your details and send your application again.'],
    restricted: ['Access changed', 'Your representative access has changed', 'Contact an administrator to restore access. Your listings remain private while your account is not verified.'],
  };
  const [label, title, description] = states[state];
  const summary = node('section', '', `panel verification-summary summary-${state}`);
  summary.setAttribute('aria-label', 'Verification status');
  summary.append(badge(label, state), node('h3', title), node('p', description));
  if (latest) {
    summary.append(providerHeading(latest, latest.providerName, types[latest.providerType], 'neutral'));
    // The provider type is already shown as a tag on this summary card.
    summary.querySelector('.provider-info > p')?.remove();
    if (latest.reviewReason) summary.append(reviewNote(latest.reviewReason));
    summary.append(submittedDetails(latest));
  }
  panel.append(summary);

  const steps = node('ol', '', 'verification-steps');
  steps.setAttribute('aria-label', 'Steps to publication');
  const published = listingData.listings.some((item) => item.published);
  const step = state === 'new' || state === 'rejected' ? 0 : verification.verified ? 2 : 1;
  for (const [index, [name, hint]] of [
    ['Your details', 'Tell us who you represent'], ['Manual review', 'We check your application'], ['Listing approval', 'Approved listings go live'],
  ].entries()) {
    const complete = index < step || (index === 2 && published);
    const item = node('li', '', complete ? 'is-complete' : '');
    if (index === step && !published) item.setAttribute('aria-current', 'step');
    const number = node('span', complete ? '✓' : String(index + 1).padStart(2, '0'), 'step-number');
    number.setAttribute('aria-hidden', 'true');
    const text = node('div'); text.append(node('b', name), node('span', hint));
    item.append(number, text); steps.append(item);
  }
  panel.append(steps);

  if (!latest || latest.status === 'rejected') {
    const application = section(latest ? 'Update your application' : 'Your representative details', 'All fields are required. These details are shared with the review team, not shown on your public listing.');
    const form = node('form', '', 'panel verification-form');
    form.setAttribute('aria-label', 'Representative application');
    const row = node('div', '', 'form-row');
    field(row, 'Provider type', 'providerType', 'select', null, latest?.providerType);
    const name = field(row, 'Tutor or learning center name', 'providerName', 'input', 120, latest?.providerName);
    name.placeholder = 'e.g. Bright Minds Center';
    form.append(row);
    field(form, 'Contact details', 'contactDetails', 'textarea', 300, latest?.contactDetails, 'A work email, phone number or public contact page we can use to verify your connection.');
    field(form, 'Your connection to the provider', 'evidence', 'textarea', 2000, latest?.evidence, 'Describe your role and include a public website, staff directory or other information our team can check.');
    const footer = node('div', '', 'form-footer');
    footer.append(node('p', 'Please don’t include passwords or identity documents.', 'field-hint'), button(latest ? 'Resubmit application' : 'Submit for verification'));
    form.append(footer);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      run(() => api('/api/verification/submit', values), 'Application submitted for review.');
    });
    application.append(form); panel.append(application);
  }

  if (verification.applications.length > 1) {
    const history = node('details', '', 'panel application-history');
    history.append(node('summary', `Previous applications (${verification.applications.length - 1})`));
    for (const item of verification.applications.slice(1)) {
      const card = node('article', '', 'history-entry');
      card.append(providerHeading(item, item.providerName, statusLabels[item.status], item.status));
      if (item.reviewReason) card.append(reviewNote(item.reviewReason));
      card.append(submittedDetails(item)); history.append(card);
    }
    panel.append(history);
  }

  const listings = section('Your listings', 'Representative verification and listing approval are separate. Only listings with both approvals are public.');
  if (!latest) {
    const empty = node('div', '', 'panel workflow-empty');
    empty.append(node('h4', 'Your next step: create a listing'), node('p', 'Submit your verification application first. Then you can send a listing for review.', 'muted'));
    listings.append(empty); panel.append(listings); return;
  }
  for (const listing of listingData.listings) {
    const card = node('article', '', 'panel listing-submission');
    const label = listing.published ? 'Published' : listing.status === 'rejected' ? 'Changes requested · Private' : listing.status === 'approved' ? 'Approved · Private' : 'In review · Private';
    card.append(providerHeading(listing, listing.title, label, listing.published ? 'approved' : listing.status === 'rejected' ? 'rejected' : 'pending'), node('p', listing.description, 'submitted-text'));
    if (listing.reviewReason) card.append(reviewNote(listing.reviewReason));
    listings.append(card);
  }
  const form = node('form', '', 'panel verification-form');
  form.setAttribute('aria-label', 'Listing submission');
  form.append(node('h4', 'Submit a listing'));
  field(form, 'Listing title', 'title', 'input', 120);
  field(form, 'Listing description', 'description', 'textarea', 2000, '', 'Describe what you teach and who the lessons are for.');
  const footer = node('div', '', 'form-footer');
  footer.append(node('p', 'Your listing stays private until approved.', 'field-hint'), button('Submit listing for review'));
  form.append(footer);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    run(() => api('/api/listings/submit', values), 'Listing submitted. It stays private until approved.');
  });
  listings.append(form); panel.append(listings);

  function reviewCard(item, kind) {
    const isApplication = kind === 'verification';
    const form = node('form', '', 'panel review-card');
    form.setAttribute('aria-label', `Review ${item.providerName || item.title}`);
    form.append(providerHeading(item, item.providerName || item.title, isApplication ? 'Awaiting review' : 'Unpublished', 'pending'), node('p', item.applicantEmail, 'submitted-text'));
    form.append(node('p', `Submitted ${dateLabel(item.submittedAt)}`, 'field-hint'));
    if (isApplication) {
      const details = node('div', '', 'review-evidence');
      details.append(node('p', 'Contact details', 'field-label'), node('p', item.contactDetails, 'submitted-text'),
        node('p', 'Supporting information', 'field-label'), node('p', item.evidence, 'submitted-text'));
      form.append(details);
    } else {
      form.append(node('p', item.description, 'submitted-text'), badge(item.representativeVerified ? 'Representative verified' : 'Representative verification required', item.representativeVerified ? 'approved' : 'pending'));
      if (!item.representativeVerified) form.append(node('p', 'Verify this representative before approving their listing.', 'field-hint'));
    }
    const reason = field(form, 'Review note', 'reason', 'textarea', 1000, '', 'Required when requesting changes. The applicant will see your note.');
    reason.required = false;
    const actions = node('div', '', 'review-actions');
    const approve = button(isApplication ? 'Approve representative' : 'Approve listing', 'approved');
    if (!isApplication && !item.representativeVerified) {
      approve.disabled = true;
      approve.dataset.blocked = 'true';
    }
    actions.append(button('Request changes', 'rejected', 'btn'), approve);
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
        decision === 'approved' ? 'Approved.' : 'Changes requested. The applicant can see your note.');
    });
    reason.addEventListener('input', () => reason.setCustomValidity(''));
    return form;
  }
}
