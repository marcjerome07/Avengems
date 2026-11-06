import * as wishlistService from './wishlistService';

/** Account-scoped, memory-only view of the server wishlist. */
export function createWishlistStore(service = wishlistService, { getOwner } = {}) {
  let state = Object.freeze({ ownerId: null, items: [], loading: false, error: null, pending: [] });
  let epoch = 0;
  let controller = new AbortController();
  let loading;
  let pending = new Map();
  const listeners = new Set();
  function update(patch) {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener();
  }
  const active = (owner, version) => owner === state.ownerId && version === epoch && (!getOwner || getOwner() === owner);
  function reload() {
    if (!state.ownerId) return Promise.resolve();
    if (loading) return loading;
    const owner = state.ownerId;
    const version = epoch;
    if (pending.size) return Promise.allSettled([...pending.values()]).then(() => active(owner, version) ? reload() : undefined);
    const scope = { signal: controller.signal, isCurrent: () => active(owner, version) };
    update({ loading: true, error: null });
    const operation = Promise.resolve().then(async () => {
      if (!active(owner, version)) return;
      try {
        const items = await service.loadWishlist(scope);
        if (active(owner, version)) update({ items, loading: false });
      } catch (error) {
        if (active(owner, version)) update({ loading: false, error });
      } finally { if (version === epoch) loading = undefined; }
    });
    loading = operation;
    return operation;
  }
  function setOwner(ownerId) {
    if (ownerId === state.ownerId) return loading ?? Promise.resolve();
    ++epoch;
    controller.abort();
    controller = new AbortController();
    loading = undefined;
    pending = new Map();
    update({ ownerId, items: [], loading: Boolean(ownerId), error: null, pending: [] });
    return ownerId ? reload() : Promise.resolve();
  }
  function change(product, desired) {
    const id = product.id;
    const owner = state.ownerId;
    const version = epoch;
    if (!owner || !active(owner, version)) return Promise.resolve({ ok: false, stale: true });
    // Ignore rapid repeats while this product's request is pending.
    if (pending.has(id)) return Promise.resolve({ ok: false, busy: true });
    if (state.loading || state.error) return Promise.resolve({ ok: false, unavailable: true });
    const previous = state.items.find((item) => item.id === id);
    const adding = desired ?? !previous;
    if (!adding && !previous) return Promise.resolve({ ok: true, changed: false });
    update({ items: adding ? [...state.items.filter((item) => item.id !== id), product] : state.items.filter((item) => item.id !== id),
      pending: [...state.pending, id] });
    const scope = { signal: controller.signal, isCurrent: () => active(owner, version) };
    const operation = Promise.resolve().then(async () => {
      if (!active(owner, version)) return { ok: false, stale: true };
      try {
        if (adding) {
          const saved = await service.addWishlistItem(id, scope);
          if (active(owner, version)) update({ items: state.items.map((item) => item.id === id ? saved : item) });
        } else await service.removeWishlistItem(id, scope);
        if (!active(owner, version)) return { ok: false, stale: true };
        return { ok: true, changed: true, adding };
      } catch (error) {
        if (!active(owner, version)) return { ok: false, stale: true };
        const others = state.items.filter((item) => item.id !== id);
        update({ items: previous ? [...others, previous] : others, error });
        return { ok: false, error };
      } finally {
        if (active(owner, version)) {
          pending.delete(id);
          update({ pending: state.pending.filter((key) => key !== id) });
        }
      }
    });
    pending.set(id, operation);
    return operation;
  }
  return { getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    setOwner, reload, toggle: (product) => change(product),
    remove: (id) => change(state.items.find((item) => item.id === id) ?? { id }, false) };
}
