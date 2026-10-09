// MOCK SERVICE — replace the body of these functions with real API calls when the backend is ready.
//
// Suggested endpoints: GET /api/me/wishlist, PUT /api/me/wishlist { productIds }

import { readStorage, writeStorage } from '../utils/storage';

const WISHLIST_KEY = 'wishlist';

export function loadWishlist() {
  const ids = readStorage(WISHLIST_KEY, []);
  return Array.isArray(ids) ? ids : [];
}

export function saveWishlist(ids) {
  writeStorage(WISHLIST_KEY, ids);
}
