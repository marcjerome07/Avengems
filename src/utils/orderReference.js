/** Display labels never replace internal IDs in routes or mutations. */
export function orderReference(order) {
  return typeof order?.reference === 'string' && /^AVG-\d{4}-\d{4,19}$/.test(order.reference)
    ? order.reference : order?.id || 'Order reference unavailable';
}
