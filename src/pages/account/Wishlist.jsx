import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { ProductGridSkeleton } from '../../components/ui/Skeleton';
import ProductMedia from '../../components/product/ProductMedia';
import { useWishlist } from '../../context/useWishlist';
import useAddToCart from '../../hooks/useAddToCart';
import { useConfirm } from '../../context/useConfirm';
import { useToast } from '../../context/useToast';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatPrice } from '../../utils/formatPrice';

export function WishlistLoadState({ loading, error, onRetry, children }) {
  if (loading) return <div role="status" aria-label="Loading wishlist"><ProductGridSkeleton count={3} /></div>;
  if (error) return <div role="alert"><p>{error.message}</p><Button onClick={onRetry}>Retry wishlist</Button></div>;
  return children;
}

export default function Wishlist() {
  useDocumentTitle('Wishlist');
  const { items: products, remove, isPending, loading, error, reload } = useWishlist();
  const addToCart = useAddToCart();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const moving = useRef(new Set());
  async function handleRemove(product) {
    const ok = await confirm({ title: 'Remove from wishlist?', message: `Remove ${product.name} from your wishlist?`, confirmLabel: 'Remove' });
    if (ok && await remove(product.id)) showToast(`${product.name} removed from your wishlist.`, { type: 'info' });
  }

  async function handleMove(product) {
    if (moving.current.has(product.id)) return;
    moving.current.add(product.id);
    try {
      if (await addToCart(product, { silent: true }, { title: 'Move to cart?', confirmLabel: 'Move to cart' })) {
        if (await remove(product.id)) showToast(`${product.name} moved to your cart.`, { type: 'success', action: { label: 'View cart', to: '/cart' } });
      }
    } finally { moving.current.delete(product.id); }
  }

  return (
    <>
      <header>
        <h1 className="account-title">Wishlist</h1>
        <p className="account-subtitle">The pieces you&apos;re dreaming about, saved in one place.</p>
        <Button variant="ghost" onClick={reload} disabled={loading}>Refresh wishlist</Button>
      </header>

      <WishlistLoadState loading={loading} error={error} onRetry={reload}>
      {products.length ? (
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
                  <Button size="sm" icon={ShoppingBag} onClick={() => handleMove(p)} disabled={oos || isPending(p.id)}>
                    {oos ? 'Out of stock' : 'Move to cart'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    disabled={isPending(p.id)}
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
      </WishlistLoadState>
    </>
  );
}
