import { preparationCategories, skillLevels, instructionLanguages, deliveryModes } from './catalog-options.js';

const node = (tag, text, className) => {
  const result = document.createElement(tag);
  if (text) result.textContent = text;
  if (className) result.className = className;
  return result;
};

export function addListingFields(form) {
  const group = node('div', '', 'verification-field');
  const label = node('label', 'Subjects');
  const input = node('input');
  input.id = 'listing-subjects'; input.name = 'subjects'; input.required = true; input.maxLength = 730;
  input.placeholder = 'e.g. Math, Physics'; label.htmlFor = input.id;
  const hint = node('p', 'Separate up to 12 subjects with commas. Students can search for these subjects.', 'field-hint');
  hint.id = 'subjects-hint'; input.setAttribute('aria-describedby', hint.id);
  group.append(label, input, hint); form.append(group);
  const categories = node('fieldset', '', 'listing-choices');
  categories.append(node('legend', 'Preparation categories (optional)'));
  for (const [value, title] of Object.entries(preparationCategories)) {
    const choice = node('label', '', 'check');
    const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.name = 'preparationCategories'; checkbox.value = value;
    choice.append(checkbox, document.createTextNode(title)); categories.append(choice);
  }
  form.append(categories);
  const inputField = (labelText, name, type, hintText = '') => {
    const wrapper = node('div', '', 'verification-field');
    const label = node('label', labelText); const input = node('input');
    input.name = name; input.id = `listing-${name}`; input.type = type; label.htmlFor = input.id;
    if (type === 'text') input.maxLength = 80;
    wrapper.append(label, input);
    if (hintText) { const hint = node('p', hintText, 'field-hint'); hint.id = `${input.id}-hint`; input.setAttribute('aria-describedby', hint.id); wrapper.append(hint); }
    form.append(wrapper); return input;
  };
  inputField('City (optional for online lessons)', 'city', 'text');
  inputField('District (optional)', 'district', 'text', 'Include the city if you provide a district.');
  const levelGroup = node('div', '', 'verification-field');
  const levelLabel = node('label', 'Skill level'); const level = node('select');
  level.id = 'listing-skill-level'; level.name = 'skillLevel'; level.required = true; levelLabel.htmlFor = level.id;
  for (const [value, text] of [['', 'Choose a level'], ...Object.entries(skillLevels)]) { const option = node('option', text); option.value = value; level.append(option); }
  levelGroup.append(levelLabel, level); form.append(levelGroup);
  const fee = inputField('Monthly fee (UZS, optional)', 'monthlyFee', 'number', 'Enter an actual monthly fee. Leave blank if you only price per lesson or per course; we won’t estimate it. Enter 0 for free lessons.');
  fee.min = 0; fee.max = 100000000; fee.step = 1;
  for (const [name, label, options] of [['instructionLanguages', 'Instruction languages', instructionLanguages], ['deliveryModes', 'Delivery modes', deliveryModes]]) {
    const group = node('fieldset', '', 'listing-choices'); group.append(node('legend', `${label} (choose at least one)`));
    const inputs = [];
    for (const [value, text] of Object.entries(options)) {
      const label = node('label', '', 'check'); const input = node('input'); input.type = 'checkbox'; input.name = name; input.value = value;
      label.append(input, document.createTextNode(text)); group.append(label); inputs.push(input);
    }
    const validate = () => { inputs[0].required = !inputs.some((input) => input.checked); };
    group.addEventListener('change', validate); validate(); form.append(group);
  }
}

export function listingValues(form) {
  const values = new FormData(form);
  return {
    title: values.get('title'), description: values.get('description'),
    subjects: String(values.get('subjects') || '').split(',').map((value) => value.trim()).filter(Boolean),
    preparationCategories: values.getAll('preparationCategories'),
    city: values.get('city'), district: values.get('district'), skillLevel: values.get('skillLevel'),
    monthlyFee: values.get('monthlyFee') === '' ? null : Number(values.get('monthlyFee')),
    instructionLanguages: values.getAll('instructionLanguages'), deliveryModes: values.getAll('deliveryModes'),
  };
}

export function listingMetadata(item) {
  const tags = node('div', '', 'tags');
  for (const text of [...(item.subjects || []), ...(item.preparationCategories || []).map((key) => preparationCategories[key]),
    [item.city, item.district].filter(Boolean).join(' · '), skillLevels[item.skillLevel],
    ...(item.instructionLanguages || []).map((key) => instructionLanguages[key]), ...(item.deliveryModes || []).map((key) => deliveryModes[key]),
    item.monthlyFee == null ? 'Monthly fee not listed' : `${new Intl.NumberFormat('en-US').format(item.monthlyFee)} UZS/month`].filter(Boolean)) {
    tags.append(node('span', text, 'tag'));
  }
  return tags;
}
