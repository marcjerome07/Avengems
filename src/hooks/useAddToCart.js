import { createElement, useCallback } from 'react';
import AddToCartSummary from '../components/cart/AddToCartSummary';
import { useCart } from '../context/useCart';
import { useConfirm } from '../context/useConfirm';

/**
 * addToCart(product, { size, quantity, silent }, { title, confirmLabel })
 * Shows what is being added and asks first. Resolves to true only when the item was added.
 */
export default function useAddToCart() {
  const { addItem } = useCart();
  const confirm = useConfirm();

  return useCallback(
    async (product, options = {}, { title = 'Add to cart?', confirmLabel = 'Add to cart' } = {}) => {
      // Sold-out pieces skip the dialog; addItem shows the out-of-stock toast.
      if (product.stock <= 0) return addItem(product, options);
      const ok = await confirm({ title, message: createElement(AddToCartSummary, { product, ...options }), confirmLabel });
      return ok && addItem(product, options);
    },
    [addItem, confirm],
  );
}
