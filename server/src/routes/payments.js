import { Router } from 'express';
import { only } from '../checkout.js';
import { ApiError } from '../errors.js';

// Mounted under the verified customer /api/me router AFTER its write protections.
export function createPaymentRouter(payments) {
  const router = Router();
  router.get('/methods', async (_req, res) => res.json(await payments.capabilities()));
  const id = (req) => {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(req.params.id)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid order identifier.');
    return req.params.id;
  };
  router.get('/:id', async (req, res) => res.json({ payment: await payments.status(id(req), req.auth.userId) }));
  router.post('/:id/start', async (req, res) => {
    only(req.body, []);
    res.json(await payments.initiate(id(req), req.auth.userId));
  });
  router.post('/:id/reconcile', async (req, res) => {
    only(req.body, []);
    res.json({ payment: await payments.reconcile(id(req), req.auth.userId) });
  });
  router.post('/:id/cancel', async (req, res) => {
    only(req.body, []);
    res.json({ payment: await payments.cancel(id(req), req.auth.userId) });
  });
  router.use((error, req, res, next) => next(error instanceof ApiError ? error : new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Payment could not be verified. Retry this order.')));
  return router;
}

export function createPaymentWebhookRouter(payments) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/xendit', async (req, res) => res.json(await payments.webhook(req)));
  router.use((error, req, res, next) => next(error instanceof ApiError ? error : new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Webhook could not be persisted.')));
  return router;
}
