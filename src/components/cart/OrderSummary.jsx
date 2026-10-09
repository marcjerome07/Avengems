import ProductMedia from '../product/ProductMedia';
import { formatPrice } from '../../utils/formatPrice';
import './OrderSummary.css';

/** Totals block shared by Cart, Checkout, confirmation and order details. */
export function TotalsList({ totals, showFreeShippingHint = false }) {
  return (
    <dl className="totals">
      <div className="totals__row">
        <dt>Subtotal</dt>
        <dd>{formatPrice(totals.subtotal)}</dd>
      </div>
      <div className="totals__row">
        <dt>Customization fees</dt>
        <dd>{totals.customizationTotal ? formatPrice(totals.customizationTotal) : '—'}</dd>
      </div>
      <div className="totals__row">
        <dt>Shipping</dt>
        <dd>{totals.shippingFee === 0 ? <span className="totals__free">Free</span> : formatPrice(totals.shippingFee)}</dd>
      </div>
      {showFreeShippingHint && totals.freeShippingRemaining > 0 && (
        <p className="totals__hint">
          Add {formatPrice(totals.freeShippingRemaining)} more for free shipping.
          <span className="totals__bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (1 - totals.freeShippingRemaining / totals.freeThreshold) * 100)}%` }} />
          </span>
        </p>
      )}
      <div className="totals__row totals__row--total">
        <dt>Total</dt>
        <dd>{formatPrice(totals.total)}</dd>
      </div>
    </dl>
  );
}

/** Compact list of line items (checkout sidebar, review step, confirmation). */
export function MiniItems({ items }) {
  return (
    <ul className="mini-items" role="list">
      {items.map((item) => (
        <li key={item.lineId} className="mini-item">
          <div className="mini-item__media">
            <ProductMedia product={item} />
            <span className="mini-item__qty" aria-label={`Quantity ${item.quantity}`}>
              {item.quantity}
            </span>
          </div>
          <div className="mini-item__info">
            <p className="mini-item__name">{item.name}</p>
            <p className="mini-item__opts">
              {item.color} · {item.size}
              {item.customized && <span className="mini-item__custom"> · Customized (+{formatPrice(item.customizationFee)})</span>}
            </p>
          </div>
          <p className="mini-item__price">{formatPrice(item.unitPrice * item.quantity)}</p>
        </li>
      ))}
    </ul>
  );
}
