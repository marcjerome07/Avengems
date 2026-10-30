export function hasConfirmationLink(location) {
  const params = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  return ['token_hash', 'code', 'access_token', 'refresh_token', 'error', 'error_code', 'error_description']
    .some((key) => params.has(key) || fragment.has(key));
}

/** Read once, keep only in memory, and scrub provider credentials from the address bar. */
export function readConfirmationLink(location, history) {
  const params = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (!hasConfirmationLink(location)) return null;
  const type = fragment.get('type') ?? params.get('type');
  let result = { error: 'This confirmation link is invalid or expired. Request a new confirmation email.' };
  if (!fragment.has('error') && !params.has('error') && (!type || ['email', 'signup'].includes(type))) {
    if (params.get('token_hash')) result = { proof: { tokenHash: params.get('token_hash') } };
    else if (fragment.get('access_token') && fragment.get('refresh_token')) {
      result = { proof: { accessToken: fragment.get('access_token'), refreshToken: fragment.get('refresh_token') } };
    }
  }
  for (const key of ['token_hash', 'code', 'access_token', 'refresh_token', 'type', 'error', 'error_code', 'error_description']) params.delete(key);
  const query = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}`);
  return result;
}
