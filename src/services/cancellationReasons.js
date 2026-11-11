// Cancellation reasons chosen by the customer, kept in this browser per account.
// TODO: backend — the customer cancel route doesn't accept a reason yet. Once it stores one
// (orders.cancellation_reason), send it with the cancel request and read it from the order instead.

import { readStorage, writeStorage } from '../utils/storage';

const keyFor = (ownerId) => `cancel-reasons:${ownerId}`;

/** { [orderId]: { reason, details, cancelledAt } } */
export function getCancellationReasons(ownerId) {
  if (!ownerId) return {};
  const saved = readStorage(keyFor(ownerId), {});
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
}

export function saveCancellationReason(ownerId, orderId, { reason = '', details = '' } = {}) {
  if (!ownerId || !orderId) return;
  const all = getCancellationReasons(ownerId);
  all[orderId] = { reason, details: details.trim().slice(0, 500), cancelledAt: new Date().toISOString() };
  writeStorage(keyFor(ownerId), all);
}

/** Text to show for a cancelled order: the server's reason first, then the one saved here. */
export function cancellationReasonText(order, saved) {
  if (order.cancellationReason) return order.cancellationReason;
  const entry = saved?.[order.id];
  if (!entry?.reason) return '';
  return entry.reason === 'Other' && entry.details ? `Other: ${entry.details}` : entry.reason;
}
