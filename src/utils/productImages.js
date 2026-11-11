import { withLocalImages } from '../data/products';

/**
 * The one place the storefront decides which photos a product shows:
 *   1. images saved on the product (uploaded from the admin dashboard),
 *   2. otherwise the bundled photos in public/images (via src/data/products.js),
 *   3. otherwise an empty list, so callers fall back to the <GemVisual /> placeholder.
 * Once every product has database images, step 2 can be removed here only.
 */
export function productImageSources(product) {
  if (!product) return [];
  return withLocalImages(product)?.images ?? [];
}

/** The photo at `index`, or null when the placeholder should be drawn. */
export function productImageAt(product, index = 0) {
  return productImageSources(product)[index] ?? null;
}
