import { Router } from 'express';
import { ApiError } from '../errors.js';
import { database } from '../customer.js';
import { PRODUCT_SELECT, toProduct } from './products.js';

function productId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid product identifier.');
  }
  return value;
}
const unavailable = () => new ApiError(404, 'PRODUCT_UNAVAILABLE', 'This product is no longer available.');

// Mounted after /api/me authentication, customer checks, and write protection.
export function createWishlistRouter(client) {
  const router = Router();
  router.get('/', async (req, res) => {
    const items = [];
    const batchSize = 100;
    for (let offset = 0; ; offset += batchSize) {
      const rows = await database(() => client.from('wishlist_items')
        .select(`product_id, product:products!inner(${PRODUCT_SELECT})`)
        .eq('user_id', req.auth.userId).eq('product.archived', false)
        .order('product_id').range(offset, offset + batchSize - 1));
      items.push(...rows.map((row) => toProduct(row.product)));
      if (rows.length < batchSize) break;
    }
    res.json({ items });
  });
  router.post('/', async (req, res) => {
    const value = req.body;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'productId')) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Provide only productId.');
    }
    const id = productId(value.productId);
    const product = await database(() => client.from('products').select(PRODUCT_SELECT)
      .eq('id', id).eq('archived', false).maybeSingle());
    if (!product) throw unavailable();
    const missingReference = await database(async () => {
      const result = await client.from('wishlist_items').upsert({ user_id: req.auth.userId, product_id: id },
        { onConflict: 'user_id,product_id', ignoreDuplicates: true });
      // Product deletion between validation and insert must not expose FK details.
      if (result.error?.code === '23503') return { data: true };
      return { data: false, error: result.error };
    });
    if (missingReference) throw unavailable();
    res.json({ item: toProduct(product) });
  });
  router.delete('/:productId', async (req, res) => {
    const id = productId(req.params.productId);
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Provide an empty JSON object.');
    }
    await database(() => client.from('wishlist_items').delete().eq('user_id', req.auth.userId).eq('product_id', id));
    res.json({ ok: true, productId: id });
  });
  return router;
}
