import { config } from '../data/config';

const formatter = new Intl.NumberFormat(config.currency.locale, {
  style: 'currency',
  currency: config.currency.code,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const shortFormatter = new Intl.NumberFormat(config.currency.locale, {
  style: 'currency',
  currency: config.currency.code,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** ₱1,299.00 */
export function formatPrice(amount) {
  return formatter.format(Number(amount) || 0);
}

/** ₱1,299 (no decimals, for ranges and charts) */
export function formatPriceShort(amount) {
  return shortFormatter.format(Number(amount) || 0);
}

/** ₱299–₱799 */
export function formatPriceRange(min, max) {
  return `${formatPriceShort(min)}–${formatPriceShort(max)}`;
}

export function formatDate(iso, options = { year: 'numeric', month: 'short', day: 'numeric' }) {
  try {
    return new Date(iso).toLocaleDateString('en-PH', options);
  } catch {
    return iso;
  }
}
