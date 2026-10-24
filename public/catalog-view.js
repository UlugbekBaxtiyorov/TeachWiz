import { preparationCategories, providerTypes } from './catalog-options.js';

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
  if (item.subjects.length) info.append(node('div', item.subjects.join(' · '), 'card-subject'));
  const tags = node('div', '', 'tags');
  tags.append(node('span', providerTypes[item.providerType], 'tag'));
  for (const category of item.preparationCategories) tags.append(node('span', preparationCategories[category], 'tag'));
  info.append(tags);
  main.append(avatar, info); card.append(main);
  const action = node('a', 'View listing', 'btn btn-primary'); action.href = link.href;
  card.append(action);
  return card;
}

export function listingDetails(item) {
  const fragment = document.createDocumentFragment();
  fragment.append(node('p', 'Verified representative', 'eyebrow'), node('h1', item.providerName), node('p', item.title, 'lead'));
  const tags = node('div', '', 'tags');
  for (const value of [providerTypes[item.providerType], ...item.subjects, ...item.preparationCategories.map((key) => preparationCategories[key])]) tags.append(node('span', value, 'tag'));
  fragment.append(tags);
  const about = node('section', '', 'panel');
  about.append(node('h2', 'About these lessons'), node('p', item.description, 'listing-description'));
  fragment.append(about);
  return fragment;
}
