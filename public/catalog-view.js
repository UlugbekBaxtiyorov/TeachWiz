import { preparationCategories, providerTypes, skillLevels, instructionLanguages, deliveryModes } from './catalog-options.js';

const money = (amount) => new Intl.NumberFormat('en-US').format(amount).replaceAll(',', ' ');
const feeText = (fee) => fee == null ? 'Monthly fee not listed' : `${money(fee)} UZS/month`;
const lessonFeeText = (fee) => fee == null ? '' : `from ${money(fee)} UZS/lesson`;
const ratingText = (item) => item.reviewCount ? `★ ${Number(item.rating.toFixed(2))} (${item.reviewCount} ${item.reviewCount === 1 ? 'review' : 'reviews'})` : 'No reviews yet';

export function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

export function listingCard(item) {
  const card = node('article', '', 'panel card catalog-card');
  const main = node('div', '', 'card-main');
  const initials = item.providerName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const avatar = node('div', initials, 'avatar'); avatar.setAttribute('aria-hidden', 'true');
  const info = node('div', '', 'card-info');
  const heading = node('h3');
  const link = node('a', item.providerName); link.href = `/listing?id=${encodeURIComponent(item.id)}`;
  heading.append(link, node('span', 'Verified', 'verified'));
  info.append(heading, node('p', item.title, 'listing-title'));
  if (item.subjects.length || item.skillLevel) info.append(node('div', [item.subjects.join(', '), skillLevels[item.skillLevel]].filter(Boolean).join(' · '), 'card-subject'));
  const rating = node('div', ratingText(item), item.reviewCount ? 'rating catalog-rating' : 'muted'); info.append(rating);
  if (item.city) info.append(node('div', [item.city, item.district].filter(Boolean).join(' · '), 'muted'));
  if (item.scheduleSummary) info.append(node('div', item.scheduleSummary, 'muted'));
  const tags = node('div', '', 'tags');
  tags.append(node('span', providerTypes[item.providerType], 'tag'));
  for (const category of item.preparationCategories) tags.append(node('span', preparationCategories[category], 'tag'));
  if (item.instructionLanguages.length) tags.append(node('span', item.instructionLanguages.map((key) => instructionLanguages[key]).join(' · '), 'tag'));
  if (item.deliveryModes.length) tags.append(node('span', item.deliveryModes.map((key) => deliveryModes[key]).join(' + '), 'tag'));
  info.append(tags);
  main.append(avatar, info); card.append(main);
  const action = node('a', 'View listing', 'btn btn-primary'); action.href = link.href;
  const price = node('div', '', 'card-price'); price.append(node('div', feeText(item.monthlyFee), item.monthlyFee == null ? 'price-note' : 'price'));
  if (item.lessonFee != null) price.append(node('div', lessonFeeText(item.lessonFee), 'price-note'));
  price.append(action);
  card.append(price);
  return card;
}

export function listingDetails(item) {
  const fragment = document.createDocumentFragment();
  fragment.append(node('p', 'Verified representative', 'eyebrow'), node('h1', item.providerName), node('p', item.title, 'lead'));
  const tags = node('div', '', 'tags');
  for (const value of [providerTypes[item.providerType], ...item.subjects, ...item.preparationCategories.map((key) => preparationCategories[key])]) tags.append(node('span', value, 'tag'));
  fragment.append(tags);
  fragment.append(node('p', ratingText(item), item.reviewCount ? 'rating catalog-rating' : 'muted'));
  const about = node('section', '', 'panel');
  about.append(node('h2', 'About these lessons'), node('p', item.description, 'listing-description'));
  fragment.append(about);
  const facts = (title, rows) => {
    const section = node('section', '', 'panel'); section.append(node('h2', title));
    const list = node('dl', '', 'listing-facts');
    for (const [label, value] of rows) { const row = node('div'); row.append(node('dt', label), node('dd', value)); list.append(row); }
    section.append(list); fragment.append(section);
    return section;
  };
  facts('Pricing', [
    ['Monthly fee', feeText(item.monthlyFee)],
    ['Per lesson', item.lessonFee == null ? 'Not provided' : `${money(item.lessonFee)} UZS`],
  ]);
  facts('Schedule & location', [
    ['Schedule', item.scheduleSummary || 'Contact the provider for the timetable'],
    ['Address', [item.address, item.city, item.district].filter(Boolean).join(', ') || 'Not provided'],
    ['Delivery modes', item.deliveryModes.map((key) => deliveryModes[key]).join(', ') || 'Not provided'],
  ]);
  facts('Learning details', [
    ['Skill level', skillLevels[item.skillLevel] || 'Not provided'],
    ['Instruction languages', item.instructionLanguages.map((key) => instructionLanguages[key]).join(', ') || 'Not provided'],
  ]);
  facts('Contact', [
    ['Phone', item.contactPhone || 'Not provided'],
    ['Telegram', item.contactTelegram ? `@${item.contactTelegram}` : 'Not provided'],
  ]);
  return fragment;
}
