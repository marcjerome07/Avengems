import { Router } from 'express';
import { ApiError } from '../errors.js';

const TYPES = ['Ring', 'Necklace', 'Bracelet', 'Earrings'];
const STONES = ['power', 'space', 'reality', 'soul', 'time', 'mind'];
const MATERIALS = ['925 Sterling Silver', 'Stainless Steel'];
const SORTS = {
  featured: [['is_featured', false]],
  newest: [['added_at', false]],
  'price-asc': [['price', true]],
  'price-desc': [['price', false]],
  rating: [['rating', false], ['review_count', false]],
};
const SELECT = '*, collection:collections!inner(color, gemstone)';

function invalid(message) {
  throw new ApiError(400, 'VALIDATION_ERROR', message);
}

function scalar(query, name, alias) {
  const value = query[name] ?? (alias ? query[alias] : undefined);
  if (value !== undefined && typeof value !== 'string') invalid(`${name} must be a single value.`);
  return value?.trim() ?? '';
}

function list(query, name, allowed) {
  const values = scalar(query, name).split(',').map((value) => value.trim()).filter(Boolean);
  if (allowed && values.some((value) => !allowed.includes(value))) invalid(`Invalid ${name} filter.`);
  return [...new Set(values)];
}

function price(query, name, alias) {
  const value = scalar(query, name, alias);
  if (!value) return undefined;
  if (!/^\d+(\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value))) {
    invalid(`${name} must be a non-negative price with at most two decimal places.`);
  }
  return Number(value);
}

function flag(query, name, alias) {
  const value = scalar(query, name, alias);
  if (!['', 'true', 'false', '1', '0'].includes(value)) invalid(`${name} must be true, false, 1, or 0.`);
  return value === 'true' || value === '1';
}

function parseFilters(query) {
  const filters = {
    q: scalar(query, 'q'),
    type: list(query, 'type', TYPES),
    stone: list(query, 'stone', STONES),
    material: list(query, 'material', MATERIALS),
    ids: list(query, 'ids'),
    minPrice: price(query, 'minPrice', 'min'),
    maxPrice: price(query, 'maxPrice', 'max'),
    inStock: flag(query, 'inStock', 'instock'),
    customizable: flag(query, 'customizable'),
    sort: scalar(query, 'sort') || 'featured',
  };
  if (!Object.hasOwn(SORTS, filters.sort)) invalid('Invalid sort option.');
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) {
    invalid('minPrice must not exceed maxPrice.');
  }
  return filters;
}

function toProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type,
    stone: row.stone,
    color: row.collection.color,
    gemstone: row.collection.gemstone,
    material: row.material,
    price: Number(row.price),
    stock: row.stock,
    rating: Number(row.rating),
    reviewCount: row.review_count,
    isNew: row.is_new,
    isFeatured: row.is_featured,
    customizable: { size: row.customizable_size, color: row.customizable_color },
    customizationFee: Number(row.customization_fee),
    sizes: row.sizes,
    defaultSize: row.default_size,
    shortDescription: row.short_description,
    details: row.details,
    images: row.images,
    addedAt: row.added_at,
  };
}

function matchesQuery(product, q) {
  const haystack = [product.name, product.type, product.color, product.gemstone, product.material, product.stone]
    .join(' ').toLowerCase();
  // Match the frontend mock's token search, including its simple plural handling.
  // User input never becomes a PostgREST filter expression.
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((token) => haystack.includes(token.replace(/s$/, '')));
}

function checkDatabase(error) {
  if (error) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Products are temporarily unavailable. Please try again.');
}

// Accept a client so HTTP tests can run without credentials or database writes.
export function createProductsRouter(client) {
  const router = Router();

  router.get('/', async (req, res) => {
    const filters = parseFilters(req.query);
    const items = [];
    // Search spans product and collection fields. Filter in memory for this small
    // catalog, fetching batches to avoid silently truncating at Supabase's row cap.
    const batchSize = 100;
    for (let offset = 0; ; offset += batchSize) {
      let query = client.from('products').select(SELECT).eq('archived', false);
      for (const field of ['type', 'stone', 'material']) {
        if (filters[field].length) query = query.in(field, filters[field]);
      }
      if (filters.ids.length) query = query.in('id', filters.ids);
      if (filters.minPrice !== undefined) query = query.gte('price', filters.minPrice);
      if (filters.maxPrice !== undefined) query = query.lte('price', filters.maxPrice);
      if (filters.inStock) query = query.gt('stock', 0);
      if (filters.customizable) query = query.or('customizable_size.eq.true,customizable_color.eq.true');
      for (const [column, ascending] of SORTS[filters.sort]) query = query.order(column, { ascending });
      query = query.order('id', { ascending: true });
      const { data, error } = await query.range(offset, offset + batchSize - 1);
      checkDatabase(error);
      items.push(...data.map(toProduct).filter((product) => matchesQuery(product, filters.q)));
      if (data.length < batchSize) break;
    }
    res.json({ items, total: items.length });
  });

  router.get('/:slug', async (req, res) => {
    const { data, error } = await client.from('products').select(SELECT)
      .eq('archived', false).eq('slug', req.params.slug).maybeSingle();
    checkDatabase(error);
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'This product is no longer available.');
    res.json(toProduct(data));
  });

  return router;
}
