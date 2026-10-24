import { preparationCategories, skillLevels, instructionLanguages, deliveryModes } from './catalog-options.js';
import { node, listingCard, listingDetails } from './catalog-view.js';

const page = document.querySelector('[data-catalog]');
const mode = page.dataset.catalog;
const status = document.getElementById('catalog-status');
const list = document.getElementById('catalog-list');
const form = document.getElementById('catalog-form');
let pending;
let requestNumber = 0;

function empty(title, description) {
  const box = node('div', '', 'panel catalog-empty');
  box.append(node('span', '⌕', 'empty-icon'), node('h3', title), node('p', description, 'muted'));
  const action = node('a', 'Browse all listings', 'btn'); action.href = '/search'; box.append(action);
  return box;
}

function restoreControls() {
  const params = new URLSearchParams(location.search);
  for (const input of form.elements) {
    if (!input.name) continue;
    input.setCustomValidity('');
    if (input.type === 'checkbox') input.checked = params.getAll(input.name).includes(input.value);
    else {
      const value = params.get(input.name) || (input.name === 'sort' ? 'relevance' : '');
      // Preserve a valid share-link value even when it is not one of the UI presets.
      if (input.tagName === 'SELECT' && value && ![...input.options].some((option) => option.value === value)) {
        const option = node('option', value); option.value = value; input.append(option);
      }
      input.value = value;
    }
  }
  const active = document.getElementById('active-filters'); active.replaceChildren();
  for (const [key, value] of params) {
    if (!value || key === 'page' || key === 'sort') continue;
    const labels = { category: preparationCategories, level: skillLevels, language: instructionLanguages, mode: deliveryModes, type: { tutors: 'Tutors', centers: 'Centers', courses: 'Courses' } };
    const title = labels[key]?.[value] || (key === 'minFee' ? `From ${value} UZS/month` : key === 'maxFee' ? `Up to ${value} UZS/month` : key === 'minRating' ? `${value}+ ★` : value);
    const chip = node('button', `${title} ×`, 'chip');
    chip.type = 'button'; chip.setAttribute('aria-label', `Remove ${key}: ${value}`);
    chip.addEventListener('click', () => {
      const next = new URLSearchParams(location.search);
      next.delete(key, value); if (key === 'city') next.delete('district'); next.delete('page'); navigate(next);
    });
    active.append(chip);
  }
  document.getElementById('filter-toggle').textContent = `Filters${active.childElementCount ? ` (${active.childElementCount})` : ''}`;
  document.getElementById('quick-rating').setAttribute('aria-pressed', String(params.get('minRating') === '4.5'));
  document.getElementById('quick-online').setAttribute('aria-pressed', String(params.getAll('mode').includes('online')));
}

function locations(available) {
  const params = new URLSearchParams(location.search);
  const folded = (value) => value.normalize('NFKC').toLowerCase().replace(/[‘’ʻʼ`]/gu, "'").replace(/\s+/gu, ' ').trim();
  for (const [name, placeholder, values] of [
    ['city', 'All cities', available.map((item) => item.city)],
    ['district', 'All districts', available.filter((item) => !params.get('city') || folded(item.city) === folded(params.get('city'))).map((item) => item.district)],
  ]) {
    const input = document.getElementById(`filter-${name}`);
    const selected = params.get(name) || '';
    const unique = new Map(values.filter(Boolean).map((value) => [folded(value), value]));
    if (selected) unique.set(folded(selected), selected);
    input.replaceChildren();
    for (const value of ['', ...[...unique.values()].sort((a, b) => a.localeCompare(b))]) {
      const option = node('option', value || placeholder); option.value = value; input.append(option);
    }
    input.value = selected;
  }
}

function navigate(params) {
  history.pushState(null, '', `/search${params.size ? `?${params}` : ''}`);
  restoreControls(); load();
}

function pagination(result) {
  const nav = document.getElementById('catalog-pagination'); nav.replaceChildren();
  if (result.pages < 2 && result.page === 1) return;
  const addLink = (label, pageNumber) => {
    const params = new URLSearchParams(location.search); params.set('page', pageNumber);
    const link = node('a', label, 'btn'); link.href = `/search?${params}`;
    link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); navigate(params); document.getElementById('results-title').focus();
    });
    nav.append(link);
  };
  if (result.page > 1) addLink('Previous', result.page - 1);
  nav.append(node('span', `Page ${result.page} of ${Math.max(1, result.pages)}`, 'muted'));
  if (result.page < result.pages) addLink('Next', result.page + 1);
}

async function load() {
  pending?.abort(); pending = new AbortController();
  const current = ++requestNumber;
  const results = document.getElementById('catalog-results') || page;
  results.setAttribute('aria-busy', 'true'); status.textContent = 'Loading listings…';
  list?.replaceChildren();
  document.getElementById('catalog-pagination')?.replaceChildren();
  let url = `/api/catalog${mode === 'search' ? location.search : '?sort=newest'}`;
  if (mode === 'listing') url = `/api/catalog/listing?id=${encodeURIComponent(new URLSearchParams(location.search).get('id') || '')}`;
  try {
    const response = await fetch(url, { signal: pending.signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load listings.');
    if (current !== requestNumber) return;
    if (mode === 'listing') {
      document.getElementById('listing-detail').replaceChildren(listingDetails(result.listing));
      document.title = `${result.listing.providerName} — TeachWiz`;
      status.textContent = ''; return;
    }
    for (const item of mode === 'home' ? result.listings.slice(0, 3) : result.listings) list.append(listingCard(item));
    if (!result.listings.length) list.append(empty('No listings found', result.total ? 'There are no listings on this page. Try the previous page.' : 'Try a different subject or remove a filter to widen your search.'));
    if (mode === 'search') {
      document.getElementById('results-title').textContent = `${result.total} ${result.total === 1 ? 'result' : 'results'}`;
      status.textContent = result.listings.length ? `Showing ${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total} verified listings.` : result.total ? `No listings on this page. ${result.total} listings match your search.` : 'No listings match your search.';
      locations(result.locations);
      pagination(result);
    } else status.textContent = '';
  } catch (error) {
    if (error.name === 'AbortError' || current !== requestNumber) return;
    status.textContent = error instanceof TypeError ? 'Could not connect. Check your connection and try again.' : error.message;
    if (mode === 'search') document.getElementById('results-title').textContent = 'Search unavailable';
    const retry = node('button', 'Try again', 'btn'); retry.type = 'button'; retry.addEventListener('click', load);
    status.append(document.createTextNode(' '), retry);
  } finally {
    if (current === requestNumber) results.setAttribute('aria-busy', 'false');
  }
}

if (mode === 'search') {
  const submit = () => {
    const min = form.elements.minFee; const max = form.elements.maxFee;
    max.setCustomValidity(min.value !== '' && max.value !== '' && Number(min.value) > Number(max.value) ? 'Maximum monthly fee must be at least the minimum.' : '');
    if (!form.reportValidity()) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (String(value).trim() && !(key === 'sort' && value === 'relevance')) params.append(key, String(value).trim());
    navigate(params);
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); submit(); });
  page.addEventListener('input', (event) => {
    if (['minFee', 'maxFee'].includes(event.target.name)) form.elements.maxFee.setCustomValidity('');
  });
  page.addEventListener('change', (event) => {
    if (event.target.form !== form || event.target.name === 'q') return;
    if (event.target.name === 'city') form.elements.district.value = '';
    submit();
  });
  const toggle = document.getElementById('filter-toggle');
  const filters = document.getElementById('catalog-filters');
  const setOpen = (open) => { filters.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  for (const [id, name] of [['quick-price', 'minFee'], ['quick-language', 'language']]) {
    document.getElementById(id).addEventListener('click', () => { setOpen(true); page.querySelector(`[name="${name}"]`).focus(); });
  }
  for (const [id, name, value] of [['quick-rating', 'minRating', '4.5'], ['quick-online', 'mode', 'online']]) {
    document.getElementById(id).addEventListener('click', () => {
      const params = new URLSearchParams(location.search);
      if (params.getAll(name).includes(value)) params.delete(name, value);
      else { if (name === 'minRating') params.delete(name); params.append(name, value); }
      params.delete('page'); navigate(params);
    });
  }
  document.getElementById('filter-close').addEventListener('click', () => { setOpen(false); toggle.focus(); });
  filters.addEventListener('keydown', (event) => { if (event.key === 'Escape') { setOpen(false); toggle.focus(); } });
  window.addEventListener('popstate', () => { restoreControls(); load(); });
  restoreControls();
}
load();
