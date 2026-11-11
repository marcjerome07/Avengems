import { createElement, useCallback } from 'react';
import AddToCartSummary from '../components/cart/AddToCartSummary';
import { useCart } from '../context/useCart';
import { useConfirm } from '../context/useConfirm';
import useLoginPrompt from './useLoginPrompt';

/**
 * addToCart(product, { size, quantity, silent }, { title, confirmLabel })
 * Guests are asked to log in or sign up first; nothing is added for them.
 * Signed-in shoppers see what is being added and confirm. Resolves to true only when the item was added.
 */
export default function useAddToCart() {
  const { addItem } = useCart();
  const confirm = useConfirm();
  const requireLogin = useLoginPrompt();

  return useCallback(
    async (product, options = {}, { title = 'Add to cart?', confirmLabel = 'Add to cart' } = {}) => {
      if (!(await requireLogin(`add ${product.name} to your bag`))) return false;
      // Sold-out pieces skip the dialog; addItem shows the out-of-stock toast.
      if (product.stock <= 0) return addItem(product, options);
      const ok = await confirm({ title, message: createElement(AddToCartSummary, { product, ...options }), confirmLabel });
      return ok && addItem(product, options);
    },
    [addItem, confirm, requireLogin],
  );
}
