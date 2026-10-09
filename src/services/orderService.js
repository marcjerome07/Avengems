// MOCK SERVICE — replace the body of these functions with real API calls when the backend is ready.
//
// Suggested endpoints:
//   POST /api/orders                 { items, customer, shipping, paymentMethod } -> order
//   GET  /api/me/orders
//   GET  /api/orders/:id
//
// No payment is processed. Card details never reach this service: the checkout page
// validates them and discards them, sending only the payment method name.

import { delay, clone, ServiceError, ordersTable } from './mockDb';
import { calculateTotals } from './cartService';

function generateOrderNumber() {
  const existing = new Set(ordersTable.all().map((o) => o.id));
  let id;
  do {
    id = `AVG-2026-${String(Math.floor(10000 + Math.random() * 90000))}`;
  } while (existing.has(id));
  return id;
}

export async function placeOrder({ userId, items, customer, shipping, paymentMethod }) {
  await delay(700, 1200);
  if (!items?.length) throw new ServiceError('EMPTY_CART', 'Your cart is empty.');
  const totals = calculateTotals(items);
  const order = {
    id: generateOrderNumber(),
    userId,
    createdAt: new Date().toISOString(),
    status: 'Pending',
    paymentMethod,
    customer: clone(customer),
    shipping: clone(shipping),
    items: clone(items),
    subtotal: totals.subtotal,
    customizationTotal: totals.customizationTotal,
    shippingFee: totals.shippingFee,
    total: totals.total,
    source: 'placed',
  };
  ordersTable.insert(order);
  return clone(order);
}

export async function getOrdersByUser(userId) {
  await delay();
  return clone(ordersTable.all().filter((o) => o.userId === userId));
}

/** Customers can only read their own orders; admins can read any. */
export async function getOrderById(orderId, { userId, isAdmin = false } = {}) {
  await delay();
  const order = ordersTable.find(orderId);
  if (!order || (!isAdmin && order.userId !== userId)) {
    throw new ServiceError('NOT_FOUND', "We couldn't find that order.");
  }
  return clone(order);
}

export const PAYMENT_LABELS = {
  gcash: 'GCash',
  maya: 'Maya',
  cod: 'Cash on Delivery',
  card: 'Credit/Debit Card',
};

export const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
