import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createWishlistStore } from '../services/wishlistStore';
import { authSession } from '../services/authSession';
import { useAuth } from './useAuth';
import { useToast } from './useToast';
import { WishlistContext } from './useWishlist';

const customerId = (state) => state.status === 'authenticated' && state.user?.verified && state.user.role === 'customer' ? state.user.id : null;

export function WishlistProvider({ children, session = authSession, service }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const ownerId = isAuthenticated && user?.role === 'customer' ? user.id : null;
  const [store] = useState(() => createWishlistStore(service, { getOwner: () => customerId(session.getSnapshot()) }));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { showToast } = useToast();
  useEffect(() => { void store.setOwner(ownerId); }, [store, ownerId]);
  // Hide private data before the owner-change effect runs.
  const current = state.ownerId === ownerId;
  const items = useMemo(() => current && ownerId ? state.items : [], [current, ownerId, state.items]);
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const isWishlisted = useCallback((productId) => ids.includes(productId), [ids]);
  const isPending = useCallback((id) => current && state.pending.includes(id), [current, state.pending]);
  const toggle = useCallback(async (product) => {
    if (!ownerId) {
      showToast('Sign in to save pieces to your wishlist.', { type: 'info', action: { label: 'Sign in', to: '/login' } });
      return false;
    }
    if (customerId(session.getSnapshot()) !== ownerId) return false;
    const result = await store.toggle(product);
    if (customerId(session.getSnapshot()) !== ownerId || result.stale || result.busy) return false;
    if (result.error || result.unavailable) {
      showToast(result.error?.message ?? 'Your wishlist is loading or needs a retry.', { type: 'error', action: { label: 'View', to: '/account/wishlist' } });
      return false;
    }
    if (result.changed) showToast(result.adding ? `${product.name} saved to your wishlist.` : `${product.name} removed from your wishlist.`, {
      type: result.adding ? 'success' : 'info', action: result.adding ? { label: 'View', to: '/account/wishlist' } : undefined,
    });
    return result.ok;
  }, [ownerId, session, store, showToast]);
  const remove = useCallback(async (id) => {
    if (!ownerId || customerId(session.getSnapshot()) !== ownerId) return false;
    const result = await store.remove(id);
    if (customerId(session.getSnapshot()) !== ownerId || result.stale || result.busy) return false;
    if (result.error || result.unavailable) showToast(result.error?.message ?? 'Please reload your wishlist and retry.', { type: 'error' });
    return result.ok;
  }, [ownerId, session, store, showToast]);
  const value = { ids, items, count: ids.length, isWishlisted, isPending, toggle, remove,
    loading: Boolean(authLoading) || (Boolean(ownerId) && (!current || state.loading)), error: current ? state.error : null, reload: store.reload };
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}
