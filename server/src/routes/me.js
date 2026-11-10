import { Router } from 'express';
import { createRequireAuth } from '../middleware/auth.js';
import { getPublicUser } from '../profile.js';
import { ApiError } from '../errors.js';
import { ADDRESS_COLUMNS, profilePatch, addressPatch, addressId, addressNotFound, toAddress, database } from '../customer.js';
import { createWishlistRouter } from './wishlist.js';
import { createOrdersRouter } from './checkout.js';
import { createPaymentRouter } from './payments.js';

export function createMeRouter({ client, verifyAccessToken, cookieSessions, customerCancellationEnabled = false, payments }) {
  const router = Router();
  router.use(createRequireAuth(verifyAccessToken, { cookieSessions }));

  router.get('/', async (req, res) => {
    const user = await getPublicUser(client, req.auth);
    if (cookieSessions?.metadata && (req.appSession || !req.get('Authorization'))) user.session = cookieSessions.metadata(req, res);
    res.json(user);
  });

  // Every write, including Bearer requests, requires the existing Origin/CSRF checks.
  router.use((req, res, next) => {
    if (!['PATCH', 'POST', 'DELETE'].includes(req.method)) return next();
    if (!cookieSessions) throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
    return cookieSessions.protect(req, res, next);
  });
  router.use(async (req, res, next) => {
    if (req.method !== 'GET' && !req.is('application/json')) {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
    }
    const user = await getPublicUser(client, req.auth);
    if (!user.verified || user.role !== 'customer') {
      throw new ApiError(403, 'CUSTOMER_REQUIRED', 'A verified customer account is required.');
    }
    next();
  });
  router.use('/wishlist', createWishlistRouter(client));
  if (payments) router.use('/payments', createPaymentRouter(payments));
  router.use('/orders', createOrdersRouter(client, { customerCancellationEnabled, payments }));
  router.patch('/', async (req, res) => {
    const patch = profilePatch(req.body);
    const row = await database(() => client.from('profiles').update(patch).eq('id', req.auth.userId).select('id').maybeSingle());
    if (!row) throw new ApiError(403, 'PROFILE_UNAVAILABLE', 'Your account profile is unavailable.');
    res.json(await getPublicUser(client, req.auth));
  });
  router.get('/addresses', async (req, res) => {
    const rows = await database(() => client.from('addresses').select(ADDRESS_COLUMNS).eq('user_id', req.auth.userId).order('id'));
    res.json({ items: rows.map(toAddress) });
  });
  async function mutate(req, res, action) {
    const id = action === 'create' ? null : addressId(req.params.id);
    const patch = ['create', 'update'].includes(action) ? addressPatch(req.body, action === 'create') : {};
    if (!['create', 'update'].includes(action) && (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length || Array.isArray(req.body))) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Provide an empty JSON object.');
    }
    // Check ownership before RPC; the function repeats this check under its lock.
    if (id) {
      const row = await database(() => client.from('addresses').select('id').eq('user_id', req.auth.userId).eq('id', id).maybeSingle());
      if (!row) throw addressNotFound();
    }
    const rows = await database(() => client.rpc('customer_address_mutate', {
      p_user_id: req.auth.userId, p_action: action, p_id: id, p_data: patch,
    }), true);
    res.status(action === 'create' ? 201 : 200).json({ items: rows.map(toAddress) });
  }
  router.post('/addresses', (req, res) => mutate(req, res, 'create'));
  router.patch('/addresses/:id', (req, res) => mutate(req, res, 'update'));
  router.delete('/addresses/:id', (req, res) => mutate(req, res, 'delete'));
  router.patch('/addresses/:id/default', (req, res) => mutate(req, res, 'default'));

  router.use((error, req, res, next) => {
    next(error instanceof ApiError ? error : new ApiError(503, 'DATABASE_UNAVAILABLE', 'Account data is temporarily unavailable. Please try again.'));
  });

  return router;
}
