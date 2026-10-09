import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as cartService from '../services/cartService';
import { stoneFromColor } from '../utils/stoneTheme';
import { getCustomization } from '../utils/customization';
import { useToast } from './ToastContext';

const CartContext = createContext(null);
const MAX_PER_LINE = 10;

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => cartService.loadCart());
  const { showToast } = useToast();

  useEffect(() => {
    cartService.saveCart(items);
  }, [items]);

  const addItem = useCallback(
    (product, { color = product.color, size = product.defaultSize, quantity = 1, silent = false } = {}) => {
      if (product.stock <= 0) {
        showToast('Sorry, this piece is out of stock.', { type: 'error' });
        return false;
      }
      const { customized, fee } = getCustomization(product, color, size);
      const lineId = cartService.lineIdFor(product.id, color, size);
      const maxQty = Math.min(MAX_PER_LINE, product.stock);

      setItems((prev) => {
        const existing = prev.find((i) => i.lineId === lineId);
        if (existing) {
          return prev.map((i) => (i.lineId === lineId ? { ...i, quantity: Math.min(maxQty, i.quantity + quantity) } : i));
        }
        return [
          ...prev,
          {
            lineId,
            productId: product.id,
            slug: product.slug,
            name: product.name,
            type: product.type,
            stone: stoneFromColor(color),
            color,
            size,
            material: product.material,
            basePrice: product.price,
            customized,
            customizationFee: fee,
            unitPrice: product.price + fee,
            quantity: Math.min(maxQty, quantity),
            maxQuantity: maxQty,
            // Photos only make sense if the stone color wasn't changed.
            images: color === product.color ? product.images : [],
          },
        ];
      });
      if (!silent) showToast('Added to your collection.', { type: 'success', action: { label: 'View cart', to: '/cart' } });
      return true;
    },
    [showToast],
  );

  const updateQuantity = useCallback((lineId, quantity) => {
    setItems((prev) =>
      prev.map((i) => (i.lineId === lineId ? { ...i, quantity: Math.max(1, Math.min(i.maxQuantity ?? MAX_PER_LINE, quantity)) } : i)),
    );
  }, []);

  const removeItem = useCallback(
    (lineId) => {
      setItems((prev) => prev.filter((i) => i.lineId !== lineId));
      showToast('Removed from your cart.', { type: 'info' });
    },
    [showToast],
  );

  const clearCart = useCallback(() => setItems([]), []);

  const totals = useMemo(() => cartService.calculateTotals(items), [items]);

  const value = useMemo(
    () => ({ items, totals, itemCount: totals.itemCount, addItem, updateQuantity, removeItem, clearCart }),
    [items, totals, addItem, updateQuantity, removeItem, clearCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
