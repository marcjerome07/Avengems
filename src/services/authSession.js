import * as authService from './authService';

/** Memory-only state: no setter accepts a browser-supplied identity. */
export function createAuthSession(service = authService) {
  let state = Object.freeze({ user: null, status: 'initializing', error: null });
  let generation = 0;
  let restoring;
  let signingOut;
  let loggingIn;
  let logoutIntent = false;
  const listeners = new Set();
  function update(next) {
    state = Object.freeze(next);
    for (const listener of listeners) listener();
  }
  async function restore() {
    if (logoutIntent || signingOut || state.status === 'authenticating') return null;
    if (restoring) return restoring;
    const version = ++generation;
    restoring = (async () => {
      try {
        const user = await service.getCurrentUser();
        if (version === generation) update({ user, status: user ? 'authenticated' : 'anonymous', error: null });
        return user;
      } catch (error) {
        if (version === generation) update({ user: null, status: 'error', error });
        return null;
      }
    })().finally(() => { restoring = undefined; });
    return restoring;
  }
  async function login(email, password, remember) {
    if (signingOut) throw new Error('Please wait for sign out to finish.');
    if (loggingIn) throw new Error('Please wait for sign in to finish.');
    const version = ++generation;
    logoutIntent = false;
    update({ user: null, status: 'authenticating', error: null });
    try {
      loggingIn = service.login(email, password, remember);
      const user = await loggingIn;
      if (version !== generation) throw new Error('This sign-in attempt is no longer active. Please try again.');
      update({ user, status: 'authenticated', error: null });
      return user;
    } catch (error) {
      if (version === generation) update({ user: null, status: 'anonymous', error: null });
      throw error;
    } finally { loggingIn = undefined; }
  }
  function logout() {
    if (signingOut) return signingOut;
    ++generation;
    logoutIntent = true;
    const pending = [loggingIn, restoring].filter(Boolean);
    update({ user: null, status: 'signing-out', error: null });
    signingOut = (async () => {
      try {
        // Wait for earlier responses to set/rotate cookies, then revoke the latest session.
        await Promise.allSettled(pending);
        await service.logout();
        logoutIntent = false;
        update({ user: null, status: 'anonymous', error: null });
      }
      catch (error) { update({ user: null, status: 'logout-error', error }); throw error; }
    })().finally(() => { signingOut = undefined; });
    return signingOut;
  }
  return { getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    restore, login, logout };
}

export const authSession = createAuthSession();
