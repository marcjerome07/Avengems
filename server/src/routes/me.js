import { Router } from 'express';
import { createRequireAuth } from '../middleware/auth.js';
import { getPublicUser } from '../profile.js';

export function createMeRouter({ client, verifyAccessToken, cookieSessions }) {
  const router = Router();

  router.get('/', createRequireAuth(verifyAccessToken, { cookieSessions }), async (req, res) => {
    res.json(await getPublicUser(client, req.auth));
  });

  return router;
}
