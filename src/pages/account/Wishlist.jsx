import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { ProductGridSkeleton } from '../../components/ui/Skeleton';
import ProductMedia from '../../components/product/ProductMedia';
import { useWishlist } from '../../context/WishlistContext';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { getProductsByIds } from '../../services/productService';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatPrice } from '../../utils/formatPrice';

export default function Wishlist() {
  useDocumentTitle('Wishlist');
  const { ids, remove } = useWishlist();
  const { addItem } = useCart();
  const { showToast } = useToast();
  // Fetch once per visit; removals are applied locally so cards don't flash.
  const { data, loading, setData } = useServiceData(() => getProductsByIds(ids), []);
  const products = (data ?? []).filter((p) => ids.includes(p.id));

  function handleRemove(product) {
    remove(product.id);
    setData((list) => list.filter((p) => p.id !== product.id));
    showToast(`${product.name} removed from your wishlist.`, { type: 'info' });
  }

  function handleMove(product) {
    if (addItem(product, { silent: true })) {
      remove(product.id);
      setData((list) => list.filter((p) => p.id !== product.id));
      showToast(`${product.name} moved to your cart.`, { type: 'success', action: { label: 'View cart', to: '/cart' } });
    }
  }

  return (
    <>
      <header>
        <h1 className="account-title">Wishlist</h1>
        <p className="account-subtitle">The pieces you&apos;re dreaming about, saved in one place.</p>
      </header>

      {loading ? (
        <ProductGridSkeleton count={3} />
      ) : products.length ? (
        <ul className="wish-grid" role="list">
          {products.map((p) => {
            const oos = p.stock <= 0;
            return (
              <li key={p.id} className="wish-card">
                <Link to={`/product/${p.slug}`} className="wish-card__media" aria-label={p.name}>
                  <ProductMedia product={p} />
                  {oos && (
                    <span style={{ position: 'absolute', top: 12, left: 12 }}>
                      <Badge variant="oos">Out of Stock</Badge>
                    </span>
                  )}
                </Link>
                <div>
                  <p className="wish-card__meta">
                    {p.type} · {p.color} · {p.material}
                  </p>
                  <h2 className="wish-card__name">
                    <Link to={`/product/${p.slug}`}>{p.name}</Link>
                  </h2>
                  <p className="wish-card__price">{formatPrice(p.price)}</p>
                </div>
                <div className="wish-card__actions">
                  <Button size="sm" icon={ShoppingBag} onClick={() => handleMove(p)} disabled={oos}>
                    {oos ? 'Out of stock' : 'Move to cart'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    onClick={() => handleRemove(p)}
                    aria-label={`Remove ${p.name} from wishlist`}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={Heart} title="Your wishlist is empty" message="Tap the heart on any piece to save it here for later.">
          <Button to="/shop">Discover pieces</Button>
        </EmptyState>
      )}
    </>
  );
}
