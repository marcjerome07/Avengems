import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShoppingBag, Heart } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Rating from '../ui/Rating';
import QuantitySelector from '../ui/QuantitySelector';
import ProductMedia from './ProductMedia';
import useAddToCart from '../../hooks/useAddToCart';
import { useWishlist } from '../../context/useWishlist';
import { formatPrice } from '../../utils/formatPrice';
import { stoneVar } from '../../utils/stoneTheme';
import './QuickViewModal.css';

export default function QuickViewModal({ product, open, onClose }) {
  const [quantity, setQuantity] = useState(1);
  const addToCart = useAddToCart();
  const { isWishlisted, isPending, toggle, loading: wishlistLoading } = useWishlist();
  const outOfStock = product.stock <= 0;

  async function handleAdd() {
    if (await addToCart(product, { quantity })) {
      setQuantity(1);
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={product.name} size="lg" hideTitle>
      <div className="quick-view">
        <div className="quick-view__media">
          <ProductMedia product={product} />
        </div>
        <div className="quick-view__info">
          <p className="quick-view__meta">
            <span className="stone-dot" style={{ background: stoneVar(product.stone) }} aria-hidden="true" />
            {product.type} · {product.color} · {product.gemstone}
          </p>
          <h3 className="quick-view__name">{product.name}</h3>
          <Rating value={product.rating} count={product.reviewCount} showValue />
          <p className="quick-view__price">{formatPrice(product.price)}</p>
          <p className="quick-view__desc">{product.shortDescription}</p>
          <p className="quick-view__material">
            <span>Material</span> {product.material}
          </p>
          {outOfStock ? (
            <Badge variant="oos">Out of Stock</Badge>
          ) : (
            <p className="quick-view__stock">{product.stock <= 5 ? `Only ${product.stock} left` : 'In stock'} · ships in 2–4 days</p>
          )}
          <div className="quick-view__actions">
            <QuantitySelector
              value={quantity}
              onChange={setQuantity}
              max={Math.max(1, Math.min(10, product.stock))}
              disabled={outOfStock}
            />
            <Button icon={ShoppingBag} onClick={handleAdd} disabled={outOfStock} fullWidth>
              {outOfStock ? 'Out of Stock' : 'Add to Cart'}
            </Button>
          </div>
          <Button variant="ghost" icon={Heart} onClick={() => toggle(product)}
            disabled={wishlistLoading || isPending(product.id)} aria-pressed={isWishlisted(product.id)}>
            {isWishlisted(product.id) ? 'Remove from wishlist' : 'Save to wishlist'}
          </Button>
          <Link to={`/product/${product.slug}`} className="text-link" onClick={onClose}>
            View full details <ArrowRight size={16} strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </Modal>
  );
}
