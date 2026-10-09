// MOCK SERVICE — replace the body of these functions with real API calls when the backend is ready.
//
// Suggested endpoints:
//   GET    /api/products?q=&type=&stone=&material=&minPrice=&maxPrice=&inStock=&customizable=&sort=
//   GET    /api/products/:slug
//   GET    /api/products?ids=a,b,c
//   GET    /api/collections, /api/collections/:slug, /api/packages
//   POST   /api/products          (admin)
//   PATCH  /api/products/:id      (admin)
//   DELETE /api/products/:id      (admin)

import { collections } from '../data/collections';
import { SIZES } from '../data/products';
import { packages } from '../data/packages';
import { specifications, materialNotes, packagingInfo, shippingInfo, careInfo } from '../data/productInfo';
import { config } from '../data/config';
import { delay, clone, ServiceError, productsTable } from './mockDb';

export const JEWELRY_TYPES = ['Ring', 'Necklace', 'Bracelet', 'Earrings'];
export const MATERIALS = ['925 Sterling Silver', 'Stainless Steel'];
export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Best Rated' },
];

function matchesQuery(product, q) {
  if (!q) return true;
  const haystack = [product.name, product.type, product.color, product.gemstone, product.material, product.stone].join(' ').toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token.replace(/s$/, '')));
}

function sortProducts(list, sort) {
  const sorted = list.slice();
  switch (sort) {
    case 'newest':
      return sorted.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
    case 'price-asc':
      return sorted.sort((a, b) => a.price - b.price);
    case 'price-desc':
      return sorted.sort((a, b) => b.price - a.price);
    case 'rating':
      return sorted.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    default:
      return sorted.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
  }
}

/**
 * filters: { q, types[], stones[], materials[], minPrice, maxPrice, inStock, customizable, sort }
 * returns { items, total }
 */
export async function getProducts(filters = {}) {
  await delay();
  const { q = '', types = [], stones = [], materials = [], minPrice, maxPrice, inStock, customizable, sort } = filters;
  const min = minPrice === '' || minPrice == null ? null : Number(minPrice);
  const max = maxPrice === '' || maxPrice == null ? null : Number(maxPrice);

  const items = productsTable
    .all()
    .filter(
      (p) =>
        matchesQuery(p, q) &&
        (!types.length || types.includes(p.type)) &&
        (!stones.length || stones.includes(p.stone)) &&
        (!materials.length || materials.includes(p.material)) &&
        (min == null || p.price >= min) &&
        (max == null || p.price <= max) &&
        (!inStock || p.stock > 0) &&
        (!customizable || p.customizable.size || p.customizable.color),
    );

  const sorted = sortProducts(items, sort);
  return { items: clone(sorted), total: sorted.length };
}

export async function getProductBySlug(slug) {
  await delay();
  const product = productsTable.all().find((p) => p.slug === slug);
  if (!product) throw new ServiceError('NOT_FOUND', 'This product is no longer available.');
  return clone(product);
}

export async function getProductsByIds(ids = []) {
  await delay(250, 500);
  const list = ids.map((id) => productsTable.find(id)).filter(Boolean);
  return clone(list);
}

export async function getFeaturedProducts(limit = 8) {
  await delay();
  return clone(
    productsTable
      .all()
      .filter((p) => p.isFeatured)
      .slice(0, limit),
  );
}

/** Same stone first, then same type. */
export async function getRelatedProducts(product, limit = 4) {
  await delay(250, 500);
  const others = productsTable.all().filter((p) => p.id !== product.id);
  const sameStone = others.filter((p) => p.stone === product.stone);
  const sameType = others.filter((p) => p.type === product.type && p.stone !== product.stone);
  return clone([...sameStone, ...sameType].slice(0, limit));
}

/** Suggestions from stones not already in the cart ("Complete your collection"). */
export async function getSuggestedProducts(excludeStones = [], limit = 4) {
  await delay(250, 500);
  const pool = productsTable.all().filter((p) => p.stock > 0 && !excludeStones.includes(p.stone));
  const picked = [];
  const seenStones = new Set();
  sortProducts(pool, 'rating').forEach((p) => {
    if (picked.length < limit && !seenStones.has(p.stone)) {
      picked.push(p);
      seenStones.add(p.stone);
    }
  });
  return clone(picked);
}

export async function getCollections() {
  await delay(250, 500);
  return clone(collections);
}

export async function getCollectionBySlug(slug) {
  await delay();
  const collection = collections.find((c) => c.slug === slug);
  if (!collection) throw new ServiceError('NOT_FOUND', "We couldn't find that collection.");
  const items = productsTable.all().filter((p) => p.stone === collection.stone);
  return { collection: clone(collection), products: clone(items) };
}

export async function getPackages() {
  await delay(250, 500);
  return clone(packages);
}

/** Static product info (specs, care, shipping). Synchronous: it ships with the app. */
export function getProductInfo(product) {
  return {
    specifications,
    materialNote: materialNotes[product.material] ?? '',
    packaging: packagingInfo,
    shipping: shippingInfo,
    care: careInfo,
  };
}

export const CUSTOMIZATION_FEE_RANGE = config.customizationFeeRange;

/** Size options and default size per jewelry type (used by the admin product form). */
export function getSizePreset(type) {
  const preset = SIZES[type] ?? SIZES.Ring;
  return { sizes: [...preset.options], defaultSize: preset.default };
}

/* ---------------- Admin ---------------- */

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function createProduct(data) {
  await delay();
  const id = `p-${Date.now().toString(36)}`;
  let slug = slugify(data.name);
  if (productsTable.all().some((p) => p.slug === slug)) slug = `${slug}-${id.slice(-4)}`;
  const product = {
    rating: 0,
    reviewCount: 0,
    isNew: true,
    isFeatured: false,
    addedAt: new Date().toISOString().slice(0, 10),
    images: [],
    ...data,
    id,
    slug,
  };
  productsTable.insert(product);
  return clone(product);
}

export async function updateProduct(id, patch) {
  await delay();
  if (!productsTable.find(id)) throw new ServiceError('NOT_FOUND', 'Product not found.');
  return clone(productsTable.update(id, patch));
}

export async function deleteProduct(id) {
  await delay();
  productsTable.remove(id);
  return { id };
}
