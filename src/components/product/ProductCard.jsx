import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag } from 'lucide-react';
import ProductMedia from './ProductMedia';
import QuickViewModal from './QuickViewModal';
import Badge from '../ui/Badge';
import Rating from '../ui/Rating';
import Button from '../ui/Button';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { formatPrice } from '../../utils/formatPrice';
import { stoneVar } from '../../utils/stoneTheme';
import { isCustomizable } from '../../utils/customization';
import './ProductCard.css';

const shortMaterial = (m) => (m === '925 Sterling Silver' ? '925 silver' : 'Stainless steel');

export default function ProductCard({ product }) {
  const [quickOpen, setQuickOpen] = useState(false);
  const { addItem } = useCart();
  const { isWishlisted, toggle } = useWishlist();
  const wished = isWishlisted(product.id);
  const outOfStock = product.stock <= 0;
  const href = `/product/${product.slug}`;

  return (
    <article className={`product-card ${outOfStock ? 'is-oos' : ''}`}>
      <div className="product-card__media">
        <Link to={href} tabIndex={-1} aria-hidden="true" className="product-card__image-link">
          <ProductMedia product={product} className="product-card__image" />
        </Link>

        <div className="product-card__badges">
          {outOfStock && <Badge variant="oos">Out of Stock</Badge>}
          {!outOfStock && product.isNew && <Badge variant="new">New</Badge>}
          {isCustomizable(product) && <Badge variant="custom">Customizable</Badge>}
        </div>

        <button
          type="button"
          className={`product-card__heart ${wished ? 'is-active' : ''}`}
          onClick={() => toggle(product)}
          aria-pressed={wished}
          aria-label={wished ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
        >
          <Heart size={20} strokeWidth={1.5} />
        </button>

        <Button
          variant="light"
          className="product-card__quick"
          onClick={() => setQuickOpen(true)}
          aria-label={`Quick view ${product.name}`}
        >
          Quick View
        </Button>
      </div>

      <div className="product-card__body">
        <p className="product-card__meta">
          <span className="product-card__type">
            <span className="stone-dot" style={{ background: stoneVar(product.stone) }} aria-hidden="true" />
            {product.type} · {product.color}
          </span>
          <span>{shortMaterial(product.material)}</span>
        </p>
        <h3 className="product-card__name">
          <Link to={href}>{product.name}</Link>
        </h3>
        <Rating value={product.rating} count={product.reviewCount} />
        <div className="product-card__footer">
          <p className="product-card__price">{formatPrice(product.price)}</p>
          <Button
            variant="outline"
            size="sm"
            icon={ShoppingBag}
            onClick={() => addItem(product)}
            disabled={outOfStock}
            aria-label={outOfStock ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
          >
            {outOfStock ? 'Sold out' : 'Add to Cart'}
          </Button>
        </div>
      </div>

      <QuickViewModal product={product} open={quickOpen} onClose={() => setQuickOpen(false)} />
    </article>
  );
}
