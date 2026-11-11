import ProductMedia from '../product/ProductMedia';
import { getCustomization } from '../../utils/customization';
import { formatPrice } from '../../utils/formatPrice';
import { stoneVar } from '../../utils/stoneTheme';
import './AddToCartSummary.css';

/** What the shopper is about to add, shown inside the add-to-cart confirm dialog. */
// The stone color is fixed by the product (each piece belongs to one stone).
export default function AddToCartSummary({ product, size = product.defaultSize, quantity = 1 }) {
  const { stone, color } = product;
  const { customized, fee } = getCustomization(product, size);
  const unitPrice = product.price + fee;

  return (
    <div className="add-summary">
      <div className="add-summary__media">
        <ProductMedia product={product} stone={stone} />
      </div>
      <div className="add-summary__info">
        <p className="add-summary__name">{product.name}</p>
        <dl className="add-summary__opts">
          <div>
            <dt>Color</dt>
            <dd>
              <span className="stone-dot" style={{ background: stoneVar(stone) }} aria-hidden="true" /> {color}
            </dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{size}</dd>
          </div>
          <div>
            <dt>Material</dt>
            <dd>{product.material}</dd>
          </div>
          <div>
            <dt>Quantity</dt>
            <dd>{quantity}</dd>
          </div>
          <div>
            <dt>Price</dt>
            <dd>
              {formatPrice(unitPrice)} each{customized && ` (incl. ${formatPrice(fee)} customization)`}
            </dd>
          </div>
        </dl>
        <p className="add-summary__total">
          <span>Subtotal</span> <strong>{formatPrice(unitPrice * quantity)}</strong>
        </p>
      </div>
    </div>
  );
}
