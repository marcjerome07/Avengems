import { ApiError } from '../errors.js';
import { getPublicUser } from '../profile.js';

/** Called only after createRequireAuth: roles always come from the database. */
export function createRequireAdmin(client) {
  return async (req, res, next) => {
    const user = await getPublicUser(client, req.auth);
    if (!user.verified || user.role !== 'admin') throw new ApiError(403, 'ADMIN_REQUIRED', 'A verified administrator account is required.');
    next();
  };
}
