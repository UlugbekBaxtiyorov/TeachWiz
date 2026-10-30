// KAN-11: validation for the public listing profile (pricing, schedule, contact details, address).
// Contact values are normalized once here so the UI can build tel: and t.me links without parsing.
const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };

export const profileFields = ['lessonFee', 'scheduleSummary', 'contactPhone', 'contactTelegram', 'address'];

function optionalText(value, label, max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') fail(`${label} must be text.`);
  const result = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (result.length > max || /[\u0000-\u001f\u007f]/u.test(result)) fail(`${label} must contain 0–${max} characters.`);
  return result;
}

export function fee(value, label) {
  const result = value ?? null;
  if (result !== null && (!Number.isSafeInteger(result) || result < 0 || result > 100000000)) {
    fail(`${label} must be a whole UZS amount from 0 to 100000000, or null.`);
  }
  return result;
}

// Accepts "+998 (90) 123-45-67", "998901234567" or "90 123 45 67"; stores digits with an optional leading +.
export function phoneNumber(value) {
  const raw = optionalText(value, 'Contact phone', 40);
  if (!raw) return '';
  const digits = raw.replace(/[\s().-]/gu, '');
  if (!/^\+?\d{7,15}$/u.test(digits)) fail('Contact phone must contain 7–15 digits, optionally starting with +.');
  return digits;
}

// Accepts "@name", "name", "t.me/name" or "https://t.me/name"; stores the bare Telegram username.
export function telegramUsername(value) {
  const raw = optionalText(value, 'Telegram username', 120);
  if (!raw) return '';
  const username = raw.replace(/^(?:https?:\/\/)?(?:www\.)?t\.me\//iu, '').replace(/^@/u, '').replace(/\/$/u, '');
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/u.test(username)) fail('Telegram username must be 5–32 letters, digits or underscores and start with a letter.');
  return username;
}

export function profileInput(body) {
  return {
    lessonFee: fee(body.lessonFee, 'Per-lesson fee'),
    scheduleSummary: optionalText(body.scheduleSummary, 'Schedule summary', 300),
    contactPhone: phoneNumber(body.contactPhone),
    contactTelegram: telegramUsername(body.contactTelegram),
    address: optionalText(body.address, 'Address', 200),
  };
}
