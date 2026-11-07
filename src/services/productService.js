// All catalog and admin product operations use the API. Packages and care/specification copy are static content.
import { SIZES, withLocalImages } from '../data/products';
import { packages } from '../data/packages';
import { specifications, materialNotes, packagingInfo, shippingInfo, careInfo } from '../data/productInfo';
import { config } from '../data/config';
import { ServiceError } from './serviceError';
export { getAdminProducts, createProduct, updateProduct, archiveProduct as deleteProduct } from './adminService';

export const JEWELRY_TYPES = ['Ring', 'Necklace', 'Bracelet', 'Earrings'];
export const MATERIALS = ['925 Sterling Silver', 'Stainless Steel'];
export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Best Rated' },
];

export async function getProducts(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, values] of [['type', filters.types], ['stone', filters.stones], ['material', filters.materials]]) {
    if (values?.length) params.set(key, values.join(','));
  }
  for (const key of ['q', 'minPrice', 'maxPrice', 'sort']) {
    if (filters[key] !== '' && filters[key] != null) params.set(key, String(filters[key]));
  }
  for (const key of ['inStock', 'customizable']) {
    if (filters[key]) params.set(key, 'true');
  }
  const query = params.toString();
  return requestProducts(`/api/products${query ? `?${query}` : ''}`);
}

async function requestProducts(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new ServiceError('NETWORK_ERROR', 'Unable to reach the store. Please try again.');
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ServiceError('SERVER_ERROR', 'Unable to load products. Please try again.');
  }
  if (!response.ok) {
    throw new ServiceError(data?.code || 'SERVER_ERROR', data?.message || 'Unable to load products. Please try again.');
  }
  return data;
}

export const getProductBySlug = async (slug) => withLocalImages(await requestProducts(`/api/products/${encodeURIComponent(slug)}`));
export const getProductsByIds = async (ids = []) => ids.length ? (await requestProducts(`/api/products?ids=${encodeURIComponent(ids.join(','))}`)).items : [];
export const getFeaturedProducts = async (limit = 8) => (await getProducts({ sort: 'featured' })).items.filter((product) => product.isFeatured).slice(0, limit);
export async function getRelatedProducts(product, limit = 4) {
  const others = (await getProducts()).items.filter((item) => item.id !== product.id);
  return [...others.filter((item) => item.stone === product.stone), ...others.filter((item) => item.type === product.type && item.stone !== product.stone)].slice(0, limit);
}
export async function getSuggestedProducts(excludeStones = [], limit = 4) {
  const pool = (await getProducts({ sort: 'rating', inStock: true })).items.filter((product) => !excludeStones.includes(product.stone));
  const seen = new Set();
  return pool.filter((product) => { if (seen.has(product.stone)) return false; seen.add(product.stone); return true; }).slice(0, limit);
}
export const getCollections = async () => (await requestProducts('/api/collections')).items;
export async function getCollectionBySlug(slug) {
  const collection = (await getCollections()).find((item) => item.slug === slug);
  if (!collection) throw new ServiceError('NOT_FOUND', "We couldn't find that collection.");
  return { collection, products: (await getProducts({ stones: [collection.stone] })).items };
}
export const getPackages = async () => structuredClone(packages);
export function getProductInfo(product) {
  return { specifications, materialNote: materialNotes[product.material] ?? '', packaging: packagingInfo, shipping: shippingInfo, care: careInfo };
}
export const CUSTOMIZATION_FEE_RANGE = config.customizationFeeRange;
export function getSizePreset(type) {
  const preset = SIZES[type] ?? SIZES.Ring;
  return { sizes: [...preset.options], defaultSize: preset.default };
}
