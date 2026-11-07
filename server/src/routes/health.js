import { Router } from 'express';
import { supabase } from '../supabase.js';
import { ApiError } from '../errors.js';

const router = Router();

/** GET /api/health: confirms the server is up and can read from the database. */
router.get('/', async (req, res) => {
  const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true });
  if (error) {
    console.error('Database check failed:', error.message);
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'The server is running but cannot reach the database.');
  }
  res.json({ ok: true, database: 'connected', products: count });
});

export default router;
