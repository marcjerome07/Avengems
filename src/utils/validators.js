// Client-side validators. Each returns an error message string, or '' when valid.
// The backend must repeat these checks; client validation is for UX only.

export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'number', label: 'One number', test: (v) => /\d/.test(v) },
  { id: 'special', label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export function validateRequired(value, label = 'This field') {
  return String(value ?? '').trim() ? '' : `${label} is required.`;
}

export function validateName(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'Full name is required.';
  if (v.length < 2) return 'Please enter your full name.';
  if (!/^[\p{L}\s.,'-]+$/u.test(v)) return 'Name can only contain letters, spaces, periods, and hyphens.';
  return '';
}

export function validateEmail(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Please enter a valid email address.';
  return '';
}

/** Philippine mobile number: 09XX XXX XXXX or +63 9XX XXX XXXX */
export function validatePhone(value, { required = true } = {}) {
  const digits = String(value ?? '').replace(/[\s-]/g, '');
  if (!digits) return required ? 'Phone number is required.' : '';
  if (!/^(09\d{9}|\+639\d{9})$/.test(digits)) return 'Use a PH mobile number, e.g. 0917 123 4567.';
  return '';
}

/** Formats 09171234567 as 0917 123 4567 while typing */
export function formatPhone(value) {
  const digits = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 11);
  const parts = [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 11)].filter(Boolean);
  return parts.join(' ');
}

export function validatePassword(value) {
  const v = String(value ?? '');
  if (!v) return 'Password is required.';
  const failed = PASSWORD_RULES.filter((r) => !r.test(v));
  return failed.length ? 'Password does not meet all requirements.' : '';
}

export function validatePasswordMatch(password, confirm) {
  if (!confirm) return 'Please confirm your password.';
  return password === confirm ? '' : 'Passwords do not match.';
}

export function validatePostalCode(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'Postal code is required.';
  return /^\d{4}$/.test(v) ? '' : 'Postal code must be 4 digits.';
}

/* ---------- Card (validated, then discarded; never stored) ---------- */

export function formatCardNumber(value) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

function luhnCheck(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

export function validateCardNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return 'Card number is required.';
  if (digits.length < 13 || digits.length > 19) return 'Card number must be 13 to 19 digits.';
  if (!luhnCheck(digits)) return 'Please check your card number.';
  return '';
}

export function formatExpiry(value) {
  const digits = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export function validateExpiry(value, now = new Date()) {
  const v = String(value ?? '').trim();
  if (!v) return 'Expiration date is required.';
  const match = /^(\d{2})\/(\d{2})$/.exec(v);
  if (!match) return 'Use the format MM/YY.';
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return 'Month must be between 01 and 12.';
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);
  if (endOfMonth < now) return 'This card has expired.';
  return '';
}

export function validateCvv(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'CVV is required.';
  return /^\d{3,4}$/.test(v) ? '' : 'CVV must be 3 or 4 digits.';
}

/** Runs { field: validatorFn(value, allValues) } and returns { field: message } for failures only. */
export function runValidators(values, schema) {
  const errors = {};
  Object.entries(schema).forEach(([field, fn]) => {
    const message = fn(values[field], values);
    if (message) errors[field] = message;
  });
  return errors;
}
