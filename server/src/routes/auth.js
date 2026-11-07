import { Router } from 'express';
import { ApiError } from '../errors.js';

export function createAuthRouter(cookieSessions, registration, recovery) {
  const router = Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.vary('Cookie');
    res.vary('Origin');
    next();
  });
  router.get('/csrf', (req, res) => res.json(cookieSessions.csrf(req, res)));
  if (recovery) {
    for (const [path, handler, status] of [
      ['/forgot-password', recovery.forgot, 202], ['/verify-recovery', recovery.verify, 200], ['/reset-password', recovery.reset, 200],
    ]) {
      router.post(path, cookieSessions.protect, recovery.rateLimit, async (req, res) => {
        if (!req.is('application/json')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
        res.status(status).json(await handler(req, res));
      });
    }
  }
  if (registration) {
    for (const [path, handler, status] of [
      ['/register', registration.register, 202], ['/resend-verification', registration.resend, 202],
      ['/verify-email', registration.verify, 200],
    ]) {
      router.post(path, cookieSessions.protect, registration.rateLimit, async (req, res) => {
        if (!req.is('application/json')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
        res.status(status).json(await handler(req, res));
      });
    }
  }
  router.post('/login', cookieSessions.protect, cookieSessions.rateLimit, async (req, res) => {
    if (!req.is('application/json')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
    res.json(await cookieSessions.login(req, res));
  });
  router.post('/refresh', cookieSessions.protect, async (req, res) => res.json(await cookieSessions.refresh(req, res)));
  router.post('/activity', cookieSessions.protect, async (req, res) => res.json(await cookieSessions.activity(req, res)));
  router.post('/idle', cookieSessions.protect, (req, res) => res.json(cookieSessions.checkIdle(req, res)));
  router.post('/logout', cookieSessions.protect, async (req, res) => res.json(await cookieSessions.logout(req, res)));
  // Contain unexpected errors locally so raw SDK/request errors never reach logging.
  router.use((error, req, res, next) => {
    next(error instanceof ApiError ? error : new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable. Please try again.'));
  });
  return router;
}
