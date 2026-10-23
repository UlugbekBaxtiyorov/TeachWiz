const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };

function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !allowed.includes(key))) fail('Send only the supported fields.');
}

function text(value, label, max, required = true) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') fail(`${label} must be text.`);
  const result = value.trim();
  if ((required && !result) || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result)) {
    fail(`${label} must contain ${required ? '1' : '0'}–${max} characters.`);
  }
  return result;
}

export function applicationInput(body) {
  fields(body, ['providerType', 'providerName', 'contactDetails', 'evidence']);
  if (!['tutor', 'learning_center'].includes(body.providerType)) fail('Choose tutor or learning center.');
  return {
    providerType: body.providerType,
    providerName: text(body.providerName, 'Provider name', 120),
    contactDetails: text(body.contactDetails, 'Contact details', 300),
    evidence: text(body.evidence, 'Verification details', 2000),
  };
}

export function reviewInput(body) {
  fields(body, ['id', 'decision', 'reason']);
  const id = text(body.id, 'Submission ID', 36);
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id)) fail('Invalid submission ID.');
  if (!['approved', 'rejected'].includes(body.decision)) fail('Choose approved or rejected.');
  return { id, decision: body.decision, reason: text(body.reason, 'Review note', 1000, body.decision === 'rejected') };
}

export function listingInput(body) {
  fields(body, ['title', 'description']);
  return { title: text(body.title, 'Listing title', 120), description: text(body.description, 'Description', 2000) };
}
