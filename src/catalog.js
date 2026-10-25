import { preparationCategories } from '../public/catalog-options.js';

const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
export const normalizeSearch = (value) => String(value).normalize('NFKC').toLowerCase()
  .replace(/[‘’ʻʼ`]/gu, "'").replace(/\s+/gu, ' ').trim();

export function catalogQuery(params) {
  const allowed = ['q', 'category', 'type', 'sort', 'page'];
  for (const key of params.keys()) {
    if (!allowed.includes(key)) fail(`Unsupported search filter: ${key}.`);
    if (key !== 'category' && params.getAll(key).length > 1) fail(`Send ${key} only once.`);
  }
  const q = normalizeSearch(params.get('q') || '');
  if (q.length > 150 || /[\u0000-\u001f\u007f]/u.test(q)) fail('Search must be at most 150 characters.');
  const categories = [...new Set(params.getAll('category'))];
  if (categories.some((key) => !Object.hasOwn(preparationCategories, key))) fail('Choose a supported preparation category.');
  const type = params.get('type') || '';
  if (!['', 'tutors', 'centers', 'courses'].includes(type)) fail('Choose tutors, centers or courses.');
  const sort = params.get('sort') || 'relevance';
  if (!['relevance', 'newest'].includes(sort)) fail('Choose a supported sort order.');
  const page = params.get('page') || '1';
  if (!/^[1-9]\d{0,4}$/.test(page)) fail('Page must be a positive integer up to 99999.');
  return { q, categories, type, sort, page: Number(page) };
}

export function catalogStore(db) {
  db.function('search_text', { deterministic: true }, normalizeSearch);
  const from = `FROM listings l JOIN users u ON u.id = l.user_id
    JOIN representative_applications a ON a.user_id = u.id AND a.status = 'approved'`;
  const publicOnly = "l.status = 'approved' AND u.role = 'representative'";
  const select = `l.id, l.title, l.description, l.subjects, l.preparation_categories AS preparationCategories,
    a.provider_type AS providerType, a.provider_name AS providerName`;
  const decode = (row) => ({ ...row, subjects: JSON.parse(row.subjects), preparationCategories: JSON.parse(row.preparationCategories) });
  return {
    searchListings({ q = '', categories = [], type = '', sort = 'relevance', page = 1 } = {}) {
      const where = [publicOnly];
      const values = [];
      // Match all words across the approved provider name, listing title, subjects and category labels.
      // instr treats %, _ and quotes literally. Unicode folding happens in JS, not SQLite's ASCII-only lower().
      const searchable = `search_text(a.provider_name || ' ' || l.title || ' ' || l.subjects || ' ' || replace(l.preparation_categories, '_', ' '))`;
      for (const term of q.split(' ').filter(Boolean)) { where.push(`instr(${searchable}, ?) > 0`); values.push(term); }
      if (categories.length) {
        where.push(`EXISTS (SELECT 1 FROM json_each(l.preparation_categories) WHERE value IN (${categories.map(() => '?').join(',')}))`);
        values.push(...categories);
      }
      if (type === 'tutors' || type === 'centers') { where.push('a.provider_type = ?'); values.push(type === 'tutors' ? 'tutor' : 'learning_center'); }
      const clause = `${from} WHERE ${where.join(' AND ')}`;
      const { total } = db.prepare(`SELECT count(*) AS total ${clause}`).get(...values);
      const pageSize = 24;
      const ranking = q && sort === 'relevance' ? `CASE WHEN search_text(a.provider_name) = ? THEN 0 WHEN instr(search_text(a.provider_name), ?) > 0 THEN 1 ELSE 2 END,` : '';
      const rows = db.prepare(`SELECT ${select} ${clause} ORDER BY ${ranking} l.submitted_at DESC, l.rowid DESC LIMIT ? OFFSET ?`)
        .all(...values, ...(ranking ? [q, q] : []), pageSize, (page - 1) * pageSize);
      return { listings: rows.map(decode), total, page, pageSize, pages: Math.ceil(total / pageSize) };
    },
    publishedListing(id) {
      const row = db.prepare(`SELECT ${select} ${from} WHERE ${publicOnly} AND l.id = ?`).get(id);
      return row ? decode(row) : null;
    },
  };
}
