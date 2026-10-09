// MOCK SERVICE — replace the body of these functions with real API calls when the backend is ready.
//
// The cart itself lives in CartContext and persists to localStorage.
// Totals are calculated here so the backend can later become the source of truth
// (suggested endpoint: POST /api/cart/quote { items } -> totals).

import { readStorage, writeStorage } from '../utils/storage';
import { settingsTable } from './mockDb';

const CART_KEY = 'cart';

export function loadCart() {
  const items = readStorage(CART_KEY, []);
  return Array.isArray(items) ? items : [];
}

export function saveCart(items) {
  writeStorage(CART_KEY, items);
}

export function getShippingRules() {
  const { shippingFee, freeShippingThreshold } = settingsTable.get();
  return { flatFee: shippingFee, freeThreshold: freeShippingThreshold };
}

/** Builds a cart line's identity: same product with different options = separate line. */
export function lineIdFor(productId, color, size) {
  return `${productId}|${color}|${size}`;
}

export function calculateTotals(items) {
  const { flatFee, freeThreshold } = getShippingRules();
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.basePrice * i.quantity, 0);
  const customizationTotal = items.reduce((sum, i) => sum + i.customizationFee * i.quantity, 0);
  const merchandise = subtotal + customizationTotal;
  const shippingFee = itemCount === 0 || merchandise >= freeThreshold ? 0 : flatFee;
  return {
    itemCount,
    subtotal,
    customizationTotal,
    shippingFee,
    total: merchandise + shippingFee,
    freeShippingRemaining: Math.max(0, freeThreshold - merchandise),
    freeThreshold,
  };
}
