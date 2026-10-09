// Safe wrappers around localStorage / sessionStorage.
// Every read and write is wrapped in try/catch so private windows,
// blocked storage, or corrupt JSON never crash the app.

const PREFIX = 'avg_';

function getStore(type) {
  try {
    return type === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function readStorage(key, fallback = null, type = 'local') {
  try {
    const store = getStore(type);
    if (!store) return fallback;
    const raw = store.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value, type = 'local') {
  try {
    const store = getStore(type);
    if (!store) return false;
    store.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key, type = 'local') {
  try {
    const store = getStore(type);
    if (store) store.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
