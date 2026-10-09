// Store-wide configuration. Placeholder values, easy to change.
export const config = {
  storeName: 'Avengems',
  contactEmail: 'avengems2026@gmail.com',

  currency: {
    code: 'PHP',
    locale: 'en-PH',
    symbol: '₱',
  },

  shipping: {
    flatFee: 120,
    freeThreshold: 2000, // subtotals at or above this ship free
  },

  otp: {
    length: 6,
    expiryMs: 5 * 60 * 1000, // 5 minutes
    resendCooldownMs: 60 * 1000, // 60 seconds
  },

  customizationFeeRange: { min: 100, max: 300 },
};
