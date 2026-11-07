import { ApiError } from './errors.js';

/** Query with the verified subject only, then explicitly allowlist response fields. */
export async function getPublicUser(client, identity) {
  let result;
  try {
    result = await client.from('profiles').select('id, name, phone, role, created_at')
      .eq('id', identity.userId).maybeSingle();
  } catch {
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Your profile is temporarily unavailable. Please try again.');
  }
  if (result.error) {
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'Your profile is temporarily unavailable. Please try again.');
  }
  const profile = result.data;
  if (!profile || profile.id !== identity.userId || !['customer', 'admin'].includes(profile.role)) {
    throw new ApiError(403, 'PROFILE_UNAVAILABLE', 'Your account profile is unavailable.');
  }
  return {
    id: identity.userId,
    name: profile.name,
    email: identity.email,
    role: profile.role,
    phone: profile.phone ?? '',
    verified: Boolean(identity.emailConfirmedAt),
    createdAt: profile.created_at,
  };
}

export function identityFromUser(user) {
  return { userId: user.id, email: user.email ?? null, emailConfirmedAt: user.email_confirmed_at ?? null };
}
