import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Trash2, ArrowRight } from 'lucide-react';
import PageContainer, { PageHeader } from '../components/layout/PageContainer';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import QuantitySelector from '../components/ui/QuantitySelector';
import ProductMedia from '../components/product/ProductMedia';
import ProductGrid from '../components/product/ProductGrid';
import { QuoteTotals } from '../components/cart/OrderSummary';
import { useCart } from '../context/useCart';
import { useConfirm } from '../context/useConfirm';
import { selectedCartItems } from '../services/cartService';
import { getSuggestedProducts } from '../services/productService';
import { formatPrice } from '../utils/formatPrice';
import { stoneVar, stoneName } from '../utils/stoneTheme';
import './Cart.css';

// "item" = one cart line (a product with its chosen options); "piece" = one unit of quantity.
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Checkbox that also shows the "some selected" (indeterminate) state. */
function SelectAllBox({ allSelected, someSelected, onChange, label, id }) {
  return (
    <input
      id={id}
      type="checkbox"
      className="cart-check"
      ref={(el) => {
        if (el) el.indeterminate = someSelected && !allSelected;
      }}
      checked={allSelected}
      aria-checked={someSelected && !allSelected ? 'mixed' : allSelected}
      aria-label={label}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

function CartLine({ item, selected, state, onQuantity, onRemove, onSelect }) {
  // state: 'priced' (server quote ready), 'checking' (quote loading), 'unselected' (not in the quote)
  const priced = state === 'priced';
  const optionLabel = `${item.name}, ${stoneName(item.stone)}, ${item.size ?? 'one size'}`;
  let customization = item.customized ? 'Yes' : 'No';
  if (priced && item.customized) customization = `Yes (+${formatPrice(item.customizationFee)})`;
  if (state === 'checking') customization = 'Checking…';

  return (
    <li className={`cart-line ${selected ? 'is-selected' : ''}`}>
      <div className="cart-line__check">
        <input
          type="checkbox"
          className="cart-check"
          checked={selected}
          onChange={(event) => onSelect(item.lineId, event.target.checked)}
          aria-label={`Select ${optionLabel} for checkout`}
        />
      </div>
      <Link to={`/product/${item.slug}`} className="cart-line__media" tabIndex={-1} aria-hidden="true">
        <ProductMedia product={item} />
      </Link>
      <div className="cart-line__info">
        <h2 className="cart-line__name">
          <Link to={`/product/${item.slug}`}>{item.name}</Link>
        </h2>
        <dl className="cart-line__opts">
          <div>
            <dt>Stone</dt>
            <dd>
              <span className="stone-dot" style={{ background: stoneVar(item.stone) }} aria-hidden="true" /> {stoneName(item.stone)}
            </dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{item.size}</dd>
          </div>
          <div>
            <dt>Customization</dt>
            <dd>{customization}</dd>
          </div>
        </dl>
        <p className="cart-line__unit">
          {priced ? `${formatPrice(item.unitPrice)} each` : state === 'checking' ? 'Checking current price…' : 'Select to see the current price'}
        </p>
      </div>
      <div className="cart-line__controls">
        <QuantitySelector
          size="sm"
          value={item.quantity}
          max={item.maxQuantity ?? 10}
          onChange={(q) => onQuantity(item.lineId, q)}
          label={`Quantity for ${item.name}`}
        />
        <p className="cart-line__total">{priced ? formatPrice(item.unitPrice * item.quantity) : '—'}</p>
        <button type="button" className="cart-line__remove" onClick={() => onRemove(item)} aria-label={`Remove ${optionLabel} from cart`}>
          <Trash2 size={16} strokeWidth={1.5} /> Remove
        </button>
      </div>
    </li>
  );
}

export default function Cart() {
  const { items, totals, quotedItems, quoteLoading, quoteError, reloadQuote, itemCount, updateQuantity, removeItem, removeItems, selectItem, selectAll } =
    useCart();
  const selectedItems = selectedCartItems(items);
  const selectedCount = selectedItems.length;
  const selectedPieces = selectedItems.reduce((n, item) => n + item.quantity, 0);
  const ready = selectedCount > 0 && Boolean(totals) && !quoteLoading && !quoteError;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const someSelected = selectedCount > 0;
  const prices = new Map((quotedItems ?? []).map((item) => [item.lineId, item]));
  const [suggestions, setSuggestions] = useState(null);
  const confirm = useConfirm();
  const stonesInCart = useMemo(() => [...new Set(items.map((i) => i.stone))].sort().join(','), [items]);

  useEffect(() => {
    if (!stonesInCart) return undefined;
    let active = true;
    getSuggestedProducts(stonesInCart.split(','), 4)
      .then((list) => active && setSuggestions(list))
      .catch(() => active && setSuggestions([]));
    return () => {
      active = false;
    };
  }, [stonesInCart]);

  async function handleRemove(item) {
    const ok = await confirm({
      title: 'Remove item?',
      message: `Remove ${item.name} from your bag?`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) removeItem(item.lineId);
  }

  async function handleDeleteSelected() {
    if (!selectedCount) return;
    const ok = await confirm({
      title: `Remove ${plural(selectedCount, 'item')}?`,
      message: `Remove the ${plural(selectedCount, 'selected item')} (${plural(selectedPieces, 'piece')}) from your bag?`,
      confirmLabel: 'Remove selected',
      danger: true,
    });
    if (ok) removeItems(selectedItems.map((item) => item.lineId));
  }

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

  // Pieces added through "Build your bundle" are listed together under their package name.
  const looseItems = items.filter((item) => !item.bundle);
  const bundleGroups = [...items.reduce((groups, item) => {
    if (item.bundle) groups.set(item.bundle, [...(groups.get(item.bundle) ?? []), item]);
    return groups;
  }, new Map())];
  function renderLine(item) {
    const selected = item.selected !== false;
    let state = 'unselected';
    if (selected) state = ready ? 'priced' : 'checking';
    if (selected && quoteError) state = 'unselected';
    return (
      <CartLine
        key={item.lineId}
        item={{ ...item, ...prices.get(item.lineId) }}
        selected={selected}
        state={state}
        onQuantity={updateQuantity}
        onRemove={handleRemove}
        onSelect={selectItem}
      />
    );
  }

  const merchandise = totals ? totals.subtotal + totals.customizationTotal : 0;
  let barTotal = formatPrice(0);
  if (someSelected) barTotal = quoteError ? '—' : quoteLoading || !totals ? 'Calculating…' : formatPrice(merchandise);
  let checkoutHint = '';
  if (!someSelected) checkoutHint = 'Select at least one item to check out.';
  else if (quoteError) checkoutHint = 'Prices couldn’t be checked. Retry in the order summary.';

  return (
    <PageContainer title="Your Cart" className="cart-page">
      <PageHeader title="Your Cart" subtitle={`${plural(items.length, 'item')} · ${plural(itemCount, 'piece')} in your collection`} />

      <div className="cart-layout">
        <div className="cart-main">
          <div className="cart-selection">
            <label className="cart-selection__all" htmlFor="cart-select-all">
              <span className="cart-line__check">
                <SelectAllBox id="cart-select-all" allSelected={allSelected} someSelected={someSelected} onChange={selectAll} />
              </span>
              Select All
            </label>
            <span className="cart-selection__count" role="status">
              {selectedCount} of {plural(items.length, 'item')} selected
            </span>
          </div>
          {looseItems.length > 0 && (
            <ul className="cart-lines" role="list" aria-label="Cart items">
              {looseItems.map(renderLine)}
            </ul>
          )}
          {bundleGroups.map(([bundle, lines]) => (
            <section key={bundle} className="cart-bundle" aria-label={`${bundle} bundle`}>
              <h2 className="cart-bundle__title">
                {bundle} <span className="cart-bundle__count">· {plural(lines.length, 'piece')}</span>
              </h2>
              <ul className="cart-lines" role="list">
                {lines.map(renderLine)}
              </ul>
            </section>
          ))}
        </div>

        <aside className="summary-card cart-summary" aria-labelledby="summary-title">
          <h2 id="summary-title" className="summary-card__title">
            Order summary
          </h2>
          <p className="cart-summary__scope">
            {someSelected ? `For ${plural(selectedCount, 'selected item')} (${plural(selectedPieces, 'piece')})` : 'No items selected'}
          </p>
          {someSelected ? (
            <QuoteTotals totals={totals} loading={quoteLoading} error={quoteError} onRetry={reloadQuote} showFreeShippingHint />
          ) : (
            <p className="muted">Select at least one item to see checkout totals.</p>
          )}
          <Button to="/shop" variant="ghost" fullWidth>
            Continue Shopping
          </Button>
          <p className="cart-summary__note">Unselected items stay in your cart after you check out.</p>
        </aside>
      </div>

      {/* Shopee-style checkout bar: stays visible while scrolling the cart */}
      <div className="cart-bar" role="region" aria-label="Checkout selection">
        <div className="cart-bar__left">
          <label className="cart-selection__all" htmlFor="cart-bar-select-all">
            <span className="cart-line__check">
              <SelectAllBox id="cart-bar-select-all" allSelected={allSelected} someSelected={someSelected} onChange={selectAll} />
            </span>
            <span>
              Select All <span className="cart-bar__muted">({items.length})</span>
            </span>
          </label>
          <button type="button" className="cart-bar__delete" onClick={handleDeleteSelected} disabled={!someSelected}>
            <Trash2 size={15} strokeWidth={1.5} aria-hidden="true" /> Delete selected
          </button>
        </div>
        <div className="cart-bar__right">
          <p className="cart-bar__total" aria-live="polite">
            <span className="cart-bar__label">Subtotal ({plural(selectedCount, 'item')}):</span>{' '}
            <strong>{barTotal}</strong>
          </p>
          <div className="cart-bar__action">
            <Button to="/checkout" disabled={!ready} size="lg" aria-describedby={checkoutHint ? 'cart-bar-hint' : undefined}>
              Check Out ({selectedCount})
            </Button>
            {checkoutHint && (
              <p className="cart-bar__hint" id="cart-bar-hint">
                {checkoutHint}
              </p>
            )}
          </div>
        </div>
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
