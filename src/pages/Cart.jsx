import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Trash2, ArrowRight, Lock } from 'lucide-react';
import PageContainer, { PageHeader } from '../components/layout/PageContainer';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import QuantitySelector from '../components/ui/QuantitySelector';
import ProductMedia from '../components/product/ProductMedia';
import ProductGrid from '../components/product/ProductGrid';
import { TotalsList } from '../components/cart/OrderSummary';
import { useCart } from '../context/CartContext';
import { getSuggestedProducts } from '../services/productService';
import { formatPrice } from '../utils/formatPrice';
import { stoneVar } from '../utils/stoneTheme';
import './Cart.css';

function CartLine({ item, onQuantity, onRemove }) {
  return (
    <li className="cart-line">
      <Link to={`/product/${item.slug}`} className="cart-line__media" tabIndex={-1} aria-hidden="true">
        <ProductMedia product={item} />
      </Link>
      <div className="cart-line__info">
        <h2 className="cart-line__name">
          <Link to={`/product/${item.slug}`}>{item.name}</Link>
        </h2>
        <dl className="cart-line__opts">
          <div>
            <dt>Color</dt>
            <dd>
              <span className="stone-dot" style={{ background: stoneVar(item.stone) }} aria-hidden="true" /> {item.color}
            </dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{item.size}</dd>
          </div>
          <div>
            <dt>Customization</dt>
            <dd>{item.customized ? `Yes (+${formatPrice(item.customizationFee)})` : 'No'}</dd>
          </div>
        </dl>
        <p className="cart-line__unit">{formatPrice(item.unitPrice)} each</p>
      </div>
      <div className="cart-line__controls">
        <QuantitySelector
          size="sm"
          value={item.quantity}
          max={item.maxQuantity ?? 10}
          onChange={(q) => onQuantity(item.lineId, q)}
          label={`Quantity for ${item.name}`}
        />
        <p className="cart-line__total">{formatPrice(item.unitPrice * item.quantity)}</p>
        <button
          type="button"
          className="cart-line__remove"
          onClick={() => onRemove(item.lineId)}
          aria-label={`Remove ${item.name} from cart`}
        >
          <Trash2 size={16} strokeWidth={1.5} /> Remove
        </button>
      </div>
    </li>
  );
}

export default function Cart() {
  const { items, totals, updateQuantity, removeItem } = useCart();
  const [suggestions, setSuggestions] = useState(null);
  const stonesInCart = useMemo(() => [...new Set(items.map((i) => i.stone))].sort().join(','), [items]);

  useEffect(() => {
    if (!stonesInCart) return undefined;
    let active = true;
    getSuggestedProducts(stonesInCart.split(','), 4).then((list) => active && setSuggestions(list));
    return () => {
      active = false;
    };
  }, [stonesInCart]);

  if (!items.length) {
    return (
      <PageContainer title="Your Cart">
        <PageHeader title="Your Cart" />
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          message="Find a stone that feels like you. Every piece arrives in a branded pouch, ready to wear or gift."
        >
          <Button to="/shop" iconRight={ArrowRight}>
            Shop the collection
          </Button>
        </EmptyState>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Your Cart">
      <PageHeader title="Your Cart" subtitle={`${totals.itemCount} ${totals.itemCount === 1 ? 'piece' : 'pieces'} in your collection`} />

      <div className="cart-layout">
        <ul className="cart-lines" role="list" aria-label="Cart items">
          {items.map((item) => (
            <CartLine key={item.lineId} item={item} onQuantity={updateQuantity} onRemove={removeItem} />
          ))}
        </ul>

        <aside className="summary-card cart-summary" aria-labelledby="summary-title">
          <h2 id="summary-title" className="summary-card__title">
            Order summary
          </h2>
          <TotalsList totals={totals} showFreeShippingHint />
          <Button to="/checkout" size="lg" fullWidth icon={Lock}>
            Proceed to Checkout
          </Button>
          <Button to="/shop" variant="ghost" fullWidth>
            Continue Shopping
          </Button>
          <p className="cart-summary__note">Taxes included. Payment options: GCash, Maya, Cash on Delivery, or card.</p>
        </aside>
      </div>

      {(suggestions === null || suggestions.length > 0) && (
        <section className="section--tight cart-suggest" aria-labelledby="suggest-title">
          <div className="section-head">
            <div>
              <span className="section-eyebrow">Mix your stones</span>
              <h2 id="suggest-title" className="section-title">
                Complete your collection with another stone.
              </h2>
            </div>
          </div>
          <ProductGrid products={suggestions ?? []} loading={suggestions === null} skeletonCount={4} />
        </section>
      )}
    </PageContainer>
  );
}
