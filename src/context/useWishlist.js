import { createContext, useContext } from 'react';

export const WishlistContext = createContext(null);

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside <WishlistProvider>');
  return ctx;
}
