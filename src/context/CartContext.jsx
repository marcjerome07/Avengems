import { useCallback, useEffect, useMemo, useState } from 'react';
import * as cartService from '../services/cartService';
import { getCustomization } from '../utils/customization';
import { useToast } from './useToast';
import { useAuth } from './useAuth';
import { CartContext } from './useCart';
import useCartQuote from '../hooks/useCartQuote';
const MAX_PER_LINE = 10;
const { GUEST_CART } = cartService;

export function CartProvider({ children }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  // Whose cart is showing: the logged-in account, the guest cart, or null while the session is still being checked.
  const owner = authLoading ? null : isAuthenticated && user?.id ? user.id : GUEST_CART;
  const [cart, setCart] = useState(() => ({ owner, items: owner ? cartService.loadCart(owner) : [], clearGuest: false }));
  const { items } = cart;
  const { showToast } = useToast();

  // Switch carts when the account changes (login, logout, or a different account).
  if (cart.owner !== owner) {
    let next = owner ? cartService.loadCart(owner) : [];
    let clearGuest = false;
    if (cart.owner === null) {
      // Anything added while the session was loading belongs to whoever turned out to be signed in.
      next = cartService.mergeCarts(next, cart.items);
    } else if (cart.owner === GUEST_CART && owner && owner !== GUEST_CART) {
      // Logging in keeps what the shopper added as a guest, then empties the guest cart.
      next = cartService.mergeCarts(next, cart.items);
      clearGuest = true;
    }
    setCart({ owner, items: next, clearGuest });
  }

  useEffect(() => {
    if (!cart.owner) return;
    cartService.saveCart(cart.owner, cart.items);
    if (cart.clearGuest) cartService.saveCart(GUEST_CART, []);
  }, [cart]);

  const setItems = useCallback((update) => {
    setCart((current) => ({ ...current, items: typeof update === 'function' ? update(current.items) : update, clearGuest: false }));
  }, []);

  const addItem = useCallback(
    (product, { size = product.defaultSize, quantity = 1, silent = false } = {}) => {
      // Stone color is fixed per product; a caller can never change it.
      const color = product.color;
      if (product.stock <= 0) {
        showToast('Sorry, this piece is out of stock.', { type: 'error' });
        return false;
      }
      const { customized, fee } = getCustomization(product, size);
      const lineId = cartService.lineIdFor(product.id, color, size);
      const maxQty = Math.min(MAX_PER_LINE, product.stock);

      setItems((prev) => {
        const existing = prev.find((i) => i.lineId === lineId);
        if (existing) {
          return prev.map((i) => (i.lineId === lineId ? { ...i, selected: true, quantity: Math.min(maxQty, i.quantity + quantity) } : i));
        }
        return [
          ...prev,
          {
            lineId,
            selected: true,
            productId: product.id,
            slug: product.slug,
            name: product.name,
            type: product.type,
            stone: product.stone,
            color,
            size,
            material: product.material,
            basePrice: product.price,
            customized,
            customizationFee: fee,
            unitPrice: product.price + fee,
            quantity: Math.min(maxQty, quantity),
            maxQuantity: maxQty,
            images: product.images,
          },
        ];
      });
      if (!silent) showToast('Added to your collection.', { type: 'success', action: { label: 'View cart', to: '/cart' } });
      return true;
    },
    [showToast, setItems],
  );

  const updateQuantity = useCallback((lineId, quantity) => {
    setItems((prev) =>
      prev.map((i) => (i.lineId === lineId ? { ...i, quantity: Math.max(1, Math.min(i.maxQuantity ?? MAX_PER_LINE, quantity)) } : i)),
    );
  }, [setItems]);

  const removeItem = useCallback(
    (lineId) => {
      setItems((prev) => prev.filter((i) => i.lineId !== lineId));
      showToast('Removed from your cart.', { type: 'info' });
    },
    [showToast, setItems],
  );

  const removeItems = useCallback(
    (lineIds) => {
      const remove = new Set(lineIds);
      if (!remove.size) return;
      setItems((prev) => prev.filter((i) => !remove.has(i.lineId)));
      showToast(`Removed ${remove.size} ${remove.size === 1 ? 'item' : 'items'} from your cart.`, { type: 'info' });
    },
    [showToast, setItems],
  );

  const clearCart = useCallback(() => setItems([]), [setItems]);
  const selectItem = useCallback((lineId, selected) => setItems((previous) => cartService.selectCartItems(previous, selected, lineId)), [setItems]);
  const selectAll = useCallback((selected) => setItems((previous) => cartService.selectCartItems(previous, selected)), [setItems]);
  const completeCheckout = useCallback((purchased) => setItems((previous) => cartService.subtractPurchasedItems(previous, purchased)), [setItems]);
  const selectedItems = useMemo(() => cartService.selectedCartItems(items), [items]);
  const { quote, loading: quoteLoading, error: quoteError, reload: reloadQuote } = useCartQuote(selectedItems);
  const itemCount = items.reduce((count, item) => count + item.quantity, 0);
  const totals = quote?.totals ?? null;
  const quotedItems = useMemo(() => quote?.items.map((item, index) => ({ ...item, lineId: selectedItems[index]?.lineId ?? item.lineId })) ?? null, [quote, selectedItems]);

  const value = useMemo(
    () => ({ items, selectedItems, selectItem, selectAll, totals, quotedItems, quoteLoading, quoteError, reloadQuote, itemCount, addItem, updateQuantity, removeItem, removeItems, clearCart, completeCheckout }),
    [items, selectedItems, selectItem, selectAll, totals, quotedItems, quoteLoading, quoteError, reloadQuote, itemCount, addItem, updateQuantity, removeItem, removeItems, clearCart, completeCheckout],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
