import { ApiError } from './errors.js';

export const ADDRESS_COLUMNS = 'id, label, full_name, phone, address, city, province, postal_code, is_default';
const fields = { label: 'label', fullName: 'full_name', phone: 'phone', address: 'address', city: 'city', province: 'province', postalCode: 'postal_code' };
const invalid = (message) => { throw new ApiError(400, 'VALIDATION_ERROR', message); };
export const addressNotFound = () => new ApiError(404, 'NOT_FOUND', 'Address not found.');

function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length
    || Object.keys(value).some((key) => !allowed.includes(key))) invalid('Provide only supported fields.');
}
function text(value, field, max, optional = false) {
  if (typeof value !== 'string' || value.length > max || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) invalid(`Invalid ${field}.`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!optional && !normalized) invalid(`${field} is required.`);
  return normalized;
}
function name(value) {
  const result = text(value, 'name', 100);
  if (result.length < 2 || !/^[\p{L} .,\u0027-]+$/u.test(result)) invalid('Use a valid full name (2–100 characters).');
  return result;
}
function phone(value, optional = false) {
  const result = text(value, 'phone', 30, optional).replace(/[\s-]/g, '');
  if (!(optional && !result) && !/^(09\d{9}|\+639\d{9})$/.test(result)) invalid('Use a valid Philippine mobile number.');
  return result;
}
export function profilePatch(value) {
  object(value, ['name', 'phone']);
  const patch = {};
  if (Object.hasOwn(value, 'name')) patch.name = name(value.name);
  if (Object.hasOwn(value, 'phone')) patch.phone = phone(value.phone, true);
  return patch;
}
export function addressPatch(value, creating = false) {
  object(value, [...Object.keys(fields), 'isDefault']);
  const patch = {};
  for (const [key, column] of Object.entries(fields)) {
    if (!Object.hasOwn(value, key)) {
      if (creating && key !== 'label') invalid(`${key} is required.`);
      continue;
    }
    if (key === 'fullName') patch[column] = name(value[key]);
    else if (key === 'phone') patch[column] = phone(value[key]);
    else {
      patch[column] = text(value[key], key, key === 'address' ? 300 : key === 'label' ? 50 : key === 'postalCode' ? 4 : 100, key === 'label');
      if (key === 'postalCode' && !/^\d{4}$/.test(patch[column])) invalid('Postal code must be 4 digits.');
    }
  }
  if (Object.hasOwn(value, 'isDefault')) {
    if (typeof value.isDefault !== 'boolean') invalid('isDefault must be boolean.');
    patch.is_default = value.isDefault;
  }
  return patch;
}
export function addressId(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) invalid('Invalid address identifier.');
  return value;
}
export function toAddress(row) {
  return { id: row.id, label: row.label ?? '', fullName: row.full_name, phone: row.phone,
    address: row.address, city: row.city, province: row.province, postalCode: row.postal_code, isDefault: row.is_default };
}
export async function database(operation, rpc = false) {
  let result;
  try { result = await operation(); }
  catch { throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Account data is temporarily unavailable. Please try again.'); }
  if (result.error) {
    if (rpc && ['PGRST202', '42883'].includes(result.error.code)) {
      throw new ApiError(503, 'ADDRESS_MIGRATION_REQUIRED', 'Address changes are temporarily unavailable. Please contact the store.');
    }
    if (rpc && result.error.code === 'P0002') throw addressNotFound();
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Account data is temporarily unavailable. Please try again.');
  }
  return result.data;
}
