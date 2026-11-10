// Browser selections persist locally; monetary amounts come from server quotes.

import { readStorage, writeStorage } from '../utils/storage';

const CART_KEY = 'cart';

export function loadCart() {
  const items = readStorage(CART_KEY, []);
  return Array.isArray(items) ? items.filter((item) => item && typeof item === 'object' && typeof item.productId === 'string' && typeof item.lineId === 'string')
    .map((item) => ({ ...item, selected: item.selected !== false })) : [];
}

export function saveCart(items) {
  writeStorage(CART_KEY, items);
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
