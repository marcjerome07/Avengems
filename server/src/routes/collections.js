import { Router } from 'express';
import { database } from '../customer.js';

export function createCollectionsRouter(client) {
  const router = Router();
  router.get('/', async (_req, res) => {
    const data = await database(() => client.from('collections').select('id, slug, stone, stone_name, color, color_hex, gemstone, tagline, description').order('id'));
    res.json({ items: data.map((row) => ({ id: row.id, slug: row.slug, stone: row.stone, stoneName: row.stone_name,
      color: row.color, colorHex: row.color_hex, gemstone: row.gemstone, tagline: row.tagline, description: row.description })) });
  });
  return router;
}
