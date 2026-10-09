import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as wishlistService from '../services/wishlistService';
import { useToast } from './ToastContext';

const WishlistContext = createContext(null);

export function WishlistProvider({ children }) {
  const [ids, setIds] = useState(() => wishlistService.loadWishlist());
  const { showToast } = useToast();

  useEffect(() => {
    wishlistService.saveWishlist(ids);
  }, [ids]);

  const isWishlisted = useCallback((productId) => ids.includes(productId), [ids]);

  const toggle = useCallback(
    (product) => {
      const exists = ids.includes(product.id);
      setIds((prev) => (exists ? prev.filter((id) => id !== product.id) : [...prev, product.id]));
      showToast(exists ? `${product.name} removed from your wishlist.` : `${product.name} saved to your wishlist.`, {
        type: exists ? 'info' : 'success',
        action: exists ? undefined : { label: 'View', to: '/account/wishlist' },
      });
    },
    [ids, showToast],
  );

  const remove = useCallback((productId) => {
    setIds((prev) => prev.filter((id) => id !== productId));
  }, []);

  const value = useMemo(() => ({ ids, count: ids.length, isWishlisted, toggle, remove }), [ids, isWishlisted, toggle, remove]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside <WishlistProvider>');
  return ctx;
}
