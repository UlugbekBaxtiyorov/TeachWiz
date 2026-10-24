import { preparationCategories } from './catalog-options.js';

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
}

export function listingValues(form) {
  const values = new FormData(form);
  return {
    title: values.get('title'), description: values.get('description'),
    subjects: String(values.get('subjects') || '').split(',').map((value) => value.trim()).filter(Boolean),
    preparationCategories: values.getAll('preparationCategories'),
  };
}

export function listingMetadata(item) {
  const tags = node('div', '', 'tags');
  for (const text of [...(item.subjects || []), ...(item.preparationCategories || []).map((key) => preparationCategories[key])]) {
    tags.append(node('span', text, 'tag'));
  }
  return tags;
}
