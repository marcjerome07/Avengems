// Browser selections persist locally; monetary amounts come from server quotes.

import { readStorage, writeStorage, removeStorage } from '../utils/storage';

// Each account keeps its own cart in this browser; logged-out visitors share one guest cart.
export const GUEST_CART = 'guest';
const MAX_PER_LINE = 10;

const keyFor = (owner) => (owner === GUEST_CART ? 'cart:guest' : `cart:user:${owner}`);

// Before carts were per account, every visitor shared this key. Its owner is unknown,
// so it is dropped instead of being shown to (or merged into) whoever logs in next.
removeStorage('cart');

export function loadCart(owner) {
  const items = readStorage(keyFor(owner), []);
  return Array.isArray(items) ? items.filter((item) => item && typeof item === 'object' && typeof item.productId === 'string' && typeof item.lineId === 'string')
    .map((item) => ({ ...item, selected: item.selected !== false })) : [];
}

export function saveCart(owner, items) {
  writeStorage(keyFor(owner), items);
}

/** Adds `incoming` lines into `base` (e.g. a guest cart into an account's cart after login). */
export function mergeCarts(base, incoming) {
  const merged = base.map((item) => ({ ...item }));
  for (const item of incoming) {
    const existing = merged.find((m) => m.lineId === item.lineId);
    if (existing) existing.quantity = Math.min(existing.maxQuantity ?? MAX_PER_LINE, existing.quantity + item.quantity);
    else merged.push({ ...item });
  }
  return merged;
}

/** Builds a cart line's identity: same product with different options = separate line. */
export function lineIdFor(productId, color, size) {
  return `${productId}|${color}|${size}`;
}

// Legacy carts default to selected. Selection is shopping state, never authority.
export const selectedCartItems = (items) => items.filter((item) => item.selected !== false);
export const selectCartItems = (items, selected, lineId) => items.map((item) =>
  lineId === undefined || item.lineId === lineId ? { ...item, selected: selected === true } : item);
export const cartSelections = (items) => selectedCartItems(items).map((item) => ({ productId: item.productId, quantity: item.quantity, color: item.color ?? null, size: item.size ?? null }));
export function subtractPurchasedItems(items, purchased) {
  const key = (item) => JSON.stringify([item.productId, item.color ?? null, item.size ?? null]);
  const counts = new Map();
  for (const item of purchased) counts.set(key(item), (counts.get(key(item)) ?? 0) + item.quantity);
  return items.map((item) => ({ ...item, quantity: item.quantity - (counts.get(key(item)) ?? 0) })).filter((item) => item.quantity > 0);
}
