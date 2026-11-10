import { commerce } from './commerceService';

/** Latest 20 notifications plus the unread count for the signed-in customer. */
export const getNotifications = (ownerId, { signal } = {}) => commerce.request('/api/me/notifications', { ownerId, signal });
export const markNotificationRead = (id, ownerId) => commerce.request(`/api/me/notifications/${encodeURIComponent(id)}/read`,
  { method: 'POST', body: {}, ownerId });
export const markAllNotificationsRead = (ownerId) => commerce.request('/api/me/notifications/read-all', { method: 'POST', body: {}, ownerId });

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const STEPS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
/** "just now", "5 minutes ago", "yesterday", "3 weeks ago"… */
export function relativeTime(value, now = Date.now()) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  const seconds = Math.round((time - now) / 1000);
  if (Math.abs(seconds) < 45) return 'just now';
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size || unit === 'minute') return relative.format(Math.round(seconds / size), unit);
  }
  return '';
}
