import { preparationCategories, skillLevels, instructionLanguages, deliveryModes } from '../public/catalog-options.js';

const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
export const normalizeSearch = (value) => String(value).normalize('NFKC').toLowerCase()
  .replace(/[‘’ʻʼ`]/gu, "'").replace(/\s+/gu, ' ').trim();

export function catalogQuery(params) {
  const multiple = ['category', 'level', 'language', 'mode'];
  const allowed = ['q', 'category', 'type', 'sort', 'page', 'city', 'district', 'level', 'minFee', 'maxFee', 'language', 'mode', 'minRating'];
  for (const key of params.keys()) {
    if (!allowed.includes(key)) fail(`Unsupported search filter: ${key}.`);
    if (!multiple.includes(key) && params.getAll(key).length > 1) fail(`Send ${key} only once.`);
  }
  const text = (key, max) => {
    const value = params.get(key) || '';
    if (value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail(`${key} must be at most ${max} characters.`);
    return normalizeSearch(value);
  };
  const choices = (key, options) => {
    const values = [...new Set(params.getAll(key))];
    if (values.length > Object.keys(options).length || values.some((value) => !Object.hasOwn(options, value))) fail(`Choose supported ${key} filters.`);
    return values;
  };
  const fee = (key) => {
    if (!params.has(key)) return null;
    const raw = params.get(key);
    if (!/^\d{1,9}$/.test(raw) || Number(raw) > 100000000) fail(`${key} must be a whole UZS amount from 0 to 100000000.`);
    return Number(raw);
  };
  const minFee = fee('minFee'); const maxFee = fee('maxFee');
  if (minFee !== null && maxFee !== null && minFee > maxFee) fail('Minimum monthly fee cannot exceed maximum monthly fee.');
  const rating = params.get('minRating');
  if (rating !== null && !/^(?:[0-4](?:\.\d{1,2})?|5(?:\.0{1,2})?)$/.test(rating)) fail('Minimum rating must be between 0 and 5.');
  const type = params.get('type') || '';
  if (!['', 'tutors', 'centers', 'courses'].includes(type)) fail('Choose tutors, centers or courses.');
  const sort = params.get('sort') || 'relevance';
  if (!['relevance', 'newest', 'price_asc', 'price_desc', 'rating'].includes(sort)) fail('Choose a supported sort order.');
  const page = params.get('page') || '1';
  if (!/^[1-9]\d{0,4}$/.test(page)) fail('Page must be a positive integer up to 99999.');
  return {
    q: text('q', 150), categories: choices('category', preparationCategories), type, sort, page: Number(page),
    city: text('city', 80), district: text('district', 80), levels: choices('level', skillLevels),
    languages: choices('language', instructionLanguages), modes: choices('mode', deliveryModes),
    minFee, maxFee, minRating: rating === null ? null : Number(rating),
  };
}

export function catalogStore(db) {
  db.function('search_text', { deterministic: true }, normalizeSearch);
  const from = `FROM listings l JOIN users u ON u.id = l.user_id
    JOIN representative_applications a ON a.user_id = u.id AND a.status = 'approved'
    LEFT JOIN provider_rating_summaries r ON r.user_id = u.id`;
  const publicOnly = "l.status = 'approved' AND u.role = 'representative'";
  const rating = 'CASE WHEN r.review_count > 0 THEN 1.0 * r.score_total / r.review_count END';
  const select = `l.id, l.title, l.description, l.subjects, l.preparation_categories AS preparationCategories,
    a.provider_type AS providerType, a.provider_name AS providerName,
    l.city, l.district, l.skill_level AS skillLevel, l.monthly_fee AS monthlyFee,
    l.instruction_languages AS instructionLanguages, l.delivery_modes AS deliveryModes,
    ${rating} AS rating, coalesce(r.review_count, 0) AS reviewCount`;
  const decode = (row) => ({ ...row, subjects: JSON.parse(row.subjects), preparationCategories: JSON.parse(row.preparationCategories),
    instructionLanguages: JSON.parse(row.instructionLanguages), deliveryModes: JSON.parse(row.deliveryModes) });
  return {
    searchListings({ q = '', categories = [], type = '', sort = 'relevance', page = 1, city = '', district = '',
      levels = [], languages = [], modes = [], minFee = null, maxFee = null, minRating = null } = {}) {
      const where = [publicOnly]; const values = [];
      // instr treats %, _ and quotes literally; JS folds Unicode instead of SQLite's ASCII-only lower().
      const searchable = `search_text(a.provider_name || ' ' || l.title || ' ' || l.subjects || ' ' || replace(l.preparation_categories, '_', ' '))`;
      for (const term of q.split(' ').filter(Boolean)) { where.push(`instr(${searchable}, ?) > 0`); values.push(term); }
      const anyOf = (column, selected) => {
        if (!selected.length) return;
        where.push(`EXISTS (SELECT 1 FROM json_each(${column}) WHERE value IN (${selected.map(() => '?').join(',')}))`);
        values.push(...selected);
      };
      anyOf('l.preparation_categories', categories); anyOf('l.instruction_languages', languages); anyOf('l.delivery_modes', modes);
      if (type === 'tutors' || type === 'centers') { where.push('a.provider_type = ?'); values.push(type === 'tutors' ? 'tutor' : 'learning_center'); }
      for (const [column, value] of [['l.city', city], ['l.district', district]]) {
        if (value) { where.push(`search_text(${column}) = ?`); values.push(value); }
      }
      if (levels.length) { where.push(`(l.skill_level = 'all_levels' OR l.skill_level IN (${levels.map(() => '?').join(',')}))`); values.push(...levels); }
      if (minFee !== null) { where.push('l.monthly_fee >= ?'); values.push(minFee); }
      if (maxFee !== null) { where.push('l.monthly_fee <= ?'); values.push(maxFee); }
      if (minRating !== null) { where.push(`${rating} >= ?`); values.push(minRating); }
      const clause = `${from} WHERE ${where.join(' AND ')}`;
      const { total } = db.prepare(`SELECT count(*) AS total ${clause}`).get(...values);
      const pageSize = 24;
      const rankings = {
        relevance: q ? `CASE WHEN search_text(a.provider_name) = ? THEN 0 WHEN instr(search_text(a.provider_name), ?) > 0 THEN 1 ELSE 2 END,` : '',
        newest: '', price_asc: 'l.monthly_fee IS NULL, l.monthly_fee ASC,', price_desc: 'l.monthly_fee IS NULL, l.monthly_fee DESC,',
        rating: `${rating} IS NULL, ${rating} DESC,`,
      };
      const rows = db.prepare(`SELECT ${select} ${clause} ORDER BY ${rankings[sort]} l.submitted_at DESC, l.rowid DESC LIMIT ? OFFSET ?`)
        .all(...values, ...(sort === 'relevance' && q ? [q, q] : []), pageSize, (page - 1) * pageSize);
      // Facet values come only from publishable listings, independently of other filters.
      const locations = db.prepare(`SELECT min(l.city) AS city, min(l.district) AS district ${from}
        WHERE ${publicOnly} AND l.city != '' GROUP BY search_text(l.city), search_text(l.district) ORDER BY city, district`).all();
      return { listings: rows.map(decode), total, page, pageSize, pages: Math.ceil(total / pageSize), locations };
    },
    publishedListing(id) {
      const row = db.prepare(`SELECT ${select} ${from} WHERE ${publicOnly} AND l.id = ?`).get(id);
      return row ? decode(row) : null;
    },
    // Trusted backend integration seam for a future review service, never exposed as a public write API.
    recordRatingSummary(userId, { scoreTotal, reviewCount }, now = Date.now()) {
      if (!Number.isSafeInteger(reviewCount) || reviewCount < 0 || reviewCount > 1000000
          || !Number.isSafeInteger(scoreTotal) || scoreTotal < reviewCount || scoreTotal > reviewCount * 5) fail('Invalid rating aggregate.');
      db.prepare(`INSERT INTO provider_rating_summaries (user_id, score_total, review_count, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET score_total = excluded.score_total, review_count = excluded.review_count, updated_at = excluded.updated_at`)
        .run(userId, scoreTotal, reviewCount, now);
    },
  };
}
