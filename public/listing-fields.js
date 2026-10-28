import { preparationCategories, skillLevels, instructionLanguages, deliveryModes } from './catalog-options.js';

const node = (tag, text, className) => {
  const result = document.createElement(tag);
  if (text) result.textContent = text;
  if (className) result.className = className;
  return result;
};
export const money = (amount) => new Intl.NumberFormat('en-US').format(amount).replaceAll(',', ' ');
let sequence = 0;

// Builds the shared listing fields. `values` prefills an edit form (KAN-11); several forms may coexist on a page.
export function addListingFields(form, values = {}) {
  const uid = ++sequence;
  const group = node('div', '', 'verification-field');
  const label = node('label', 'Subjects');
  const input = node('input');
  input.id = `listing-subjects-${uid}`; input.name = 'subjects'; input.required = true; input.maxLength = 730;
  input.placeholder = 'e.g. Math, Physics'; label.htmlFor = input.id;
  input.value = (values.subjects || []).join(', ');
  const hint = node('p', 'Separate up to 12 subjects with commas. Students can search for these subjects.', 'field-hint');
  hint.id = `subjects-hint-${uid}`; input.setAttribute('aria-describedby', hint.id);
  group.append(label, input, hint); form.append(group);
  const categories = node('fieldset', '', 'listing-choices');
  categories.append(node('legend', 'Preparation categories (optional)'));
  for (const [value, title] of Object.entries(preparationCategories)) {
    const choice = node('label', '', 'check');
    const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.name = 'preparationCategories'; checkbox.value = value;
    checkbox.checked = (values.preparationCategories || []).includes(value);
    choice.append(checkbox, document.createTextNode(title)); categories.append(choice);
  }
  form.append(categories);
  const inputField = (labelText, name, type, hintText = '', max = 80) => {
    const wrapper = node('div', '', 'verification-field');
    const label = node('label', labelText); const input = node('input');
    input.name = name; input.id = `listing-${name}-${uid}`; input.type = type; label.htmlFor = input.id;
    if (type === 'text') input.maxLength = max;
    if (type === 'number') { input.min = 0; input.max = 100000000; input.step = 1; input.inputMode = 'numeric'; }
    input.value = values[name] == null ? '' : String(values[name]);
    wrapper.append(label, input);
    if (hintText) { const hint = node('p', hintText, 'field-hint'); hint.id = `${input.id}-hint`; input.setAttribute('aria-describedby', hint.id); wrapper.append(hint); }
    form.append(wrapper); return input;
  };
  inputField('City (optional for online lessons)', 'city', 'text');
  inputField('District (optional)', 'district', 'text', 'Include the city if you provide a district.');
  const address = inputField('Street address (optional)', 'address', 'text', 'Shown publicly so students can find you, e.g. 12 Amir Temur Avenue, 2nd floor.', 200);
  address.autocomplete = 'street-address';
  const levelGroup = node('div', '', 'verification-field');
  const levelLabel = node('label', 'Skill level'); const level = node('select');
  level.id = `listing-skill-level-${uid}`; level.name = 'skillLevel'; level.required = true; levelLabel.htmlFor = level.id;
  for (const [value, text] of [['', 'Choose a level'], ...Object.entries(skillLevels)]) { const option = node('option', text); option.value = value; level.append(option); }
  level.value = values.skillLevel || '';
  levelGroup.append(levelLabel, level); form.append(levelGroup);
  const pricing = node('div', '', 'form-row');
  const feeField = (labelText, name, hintText) => {
    const wrapper = node('div', '', 'verification-field');
    const label = node('label', labelText); const input = node('input');
    input.name = name; input.id = `listing-${name}-${uid}`; input.type = 'number'; input.min = 0; input.max = 100000000; input.step = 1; input.inputMode = 'numeric';
    input.value = values[name] == null ? '' : String(values[name]); label.htmlFor = input.id;
    const hint = node('p', hintText, 'field-hint'); hint.id = `${input.id}-hint`; input.setAttribute('aria-describedby', hint.id);
    wrapper.append(label, input, hint); pricing.append(wrapper);
  };
  feeField('Monthly fee (UZS, optional)', 'monthlyFee', 'Enter an actual monthly fee. Leave blank if you only price per lesson or per course; we won’t estimate it. Enter 0 for free lessons.');
  feeField('Per-lesson fee (UZS, optional)', 'lessonFee', 'Shown as “from … UZS/lesson” on your listing.');
  form.append(pricing);
  const schedule = inputField('Schedule summary (optional)', 'scheduleSummary', 'text', 'e.g. Mon · Wed · Fri, 16:00–19:00', 300);
  schedule.placeholder = 'Mon · Wed · Fri, 16:00–19:00';
  const contact = node('fieldset', '', 'listing-choices listing-contact-fields');
  contact.append(node('legend', 'Public contact details (optional)'));
  const phone = inputField('Phone for calls', 'contactPhone', 'text', 'Students can tap to call this number. Include the country code, e.g. +998 90 123 45 67.', 40);
  phone.type = 'tel'; phone.autocomplete = 'tel'; phone.placeholder = '+998 90 123 45 67';
  const telegram = inputField('Telegram username', 'contactTelegram', 'text', 'Students can open a chat with one tap, e.g. @brightminds or t.me/brightminds.', 120);
  telegram.placeholder = '@brightminds';
  contact.append(phone.parentElement, telegram.parentElement); form.append(contact);
  for (const [name, label, options] of [['instructionLanguages', 'Instruction languages', instructionLanguages], ['deliveryModes', 'Delivery modes', deliveryModes]]) {
    const group = node('fieldset', '', 'listing-choices'); group.append(node('legend', `${label} (choose at least one)`));
    const inputs = [];
    for (const [value, text] of Object.entries(options)) {
      const label = node('label', '', 'check'); const input = node('input'); input.type = 'checkbox'; input.name = name; input.value = value;
      input.checked = (values[name] || []).includes(value);
      label.append(input, document.createTextNode(text)); group.append(label); inputs.push(input);
    }
    const validate = () => { inputs[0].required = !inputs.some((input) => input.checked); };
    group.addEventListener('change', validate); validate(); form.append(group);
  }
}

export function listingValues(form) {
  const values = new FormData(form);
  const fee = (name) => values.get(name) === '' ? null : Number(values.get(name));
  return {
    title: values.get('title'), description: values.get('description'),
    subjects: String(values.get('subjects') || '').split(',').map((value) => value.trim()).filter(Boolean),
    preparationCategories: values.getAll('preparationCategories'),
    city: values.get('city'), district: values.get('district'), skillLevel: values.get('skillLevel'),
    monthlyFee: fee('monthlyFee'), lessonFee: fee('lessonFee'),
    instructionLanguages: values.getAll('instructionLanguages'), deliveryModes: values.getAll('deliveryModes'),
    scheduleSummary: values.get('scheduleSummary'), contactPhone: values.get('contactPhone'),
    contactTelegram: values.get('contactTelegram'), address: values.get('address'),
  };
}

export function listingMetadata(item) {
  const fragment = document.createDocumentFragment();
  const tags = node('div', '', 'tags');
  for (const text of [...(item.subjects || []), ...(item.preparationCategories || []).map((key) => preparationCategories[key]),
    [item.city, item.district].filter(Boolean).join(' · '), skillLevels[item.skillLevel],
    ...(item.instructionLanguages || []).map((key) => instructionLanguages[key]), ...(item.deliveryModes || []).map((key) => deliveryModes[key]),
    item.monthlyFee == null ? 'Monthly fee not listed' : `${money(item.monthlyFee)} UZS/month`,
    item.lessonFee == null ? '' : `from ${money(item.lessonFee)} UZS/lesson`].filter(Boolean)) {
    tags.append(node('span', text, 'tag'));
  }
  fragment.append(tags);
  const facts = node('dl', '', 'listing-profile-facts');
  for (const [label, value] of [['Schedule', item.scheduleSummary], ['Address', item.address],
    ['Phone', item.contactPhone], ['Telegram', item.contactTelegram ? `@${item.contactTelegram}` : '']]) {
    if (!value) continue;
    const row = node('div'); row.append(node('dt', label), node('dd', value)); facts.append(row);
  }
  if (facts.childElementCount) fragment.append(facts);
  return fragment;
}
