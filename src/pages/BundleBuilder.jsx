import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Check, Plus, ShoppingBag } from 'lucide-react';
import PageContainer, { PageHeader } from '../components/layout/PageContainer';
import ProductMedia from '../components/product/ProductMedia';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Skeleton from '../components/ui/Skeleton';
import { useCart } from '../context/useCart';
import { useToast } from '../context/useToast';
import useLoginPrompt from '../hooks/useLoginPrompt';
import useServiceData from '../hooks/useServiceData';
import { getPackages, getProducts } from '../services/productService';
import { getCustomization } from '../utils/customization';
import { formatPrice } from '../utils/formatPrice';
import { STONE_ORDER, stoneTheme, stoneVar } from '../utils/stoneTheme';
import './BundleBuilder.css';

const loadBundle = async () => {
  const [packages, catalog] = await Promise.all([getPackages(), getProducts()]);
  return { packages, products: catalog.items };
};

function BundlePiece({ product, picked, size, onToggle, onSize, disabled }) {
  const outOfStock = product.stock <= 0;
  const price = product.price + getCustomization(product, size).fee;
  return (
    <li className={`bundle-piece ${picked ? 'is-picked' : ''}`}>
      <div className="bundle-piece__media">
        <ProductMedia product={product} />
      </div>
      <div className="bundle-piece__info">
        <p className="bundle-piece__meta">
          <span className="stone-dot" style={{ background: stoneVar(product.stone) }} aria-hidden="true" /> {product.type} · {product.color}
        </p>
        <h3 className="bundle-piece__name">{product.name}</h3>
        <p className="bundle-piece__price">{outOfStock ? 'Out of stock' : formatPrice(price)}</p>
        {picked && product.sizes?.length > 1 && (
          <Select label="Size" value={size} onChange={(e) => onSize(product.id, e.target.value)}
            options={product.sizes.map((s) => ({ value: s, label: s === product.defaultSize ? s : `${s} (+${formatPrice(product.customizationFee)})` }))} />
        )}
        <Button size="sm" variant={picked ? 'primary' : 'outline'} icon={picked ? Check : Plus} fullWidth
          disabled={outOfStock || (disabled && !picked)} aria-pressed={picked} onClick={() => onToggle(product)}>
          {picked ? 'Selected' : 'Add to bundle'}
        </Button>
      </div>
    </li>
  );
}

export default function BundleBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const requireLogin = useLoginPrompt();
  const { data, error, reload } = useServiceData(loadBundle);
  // productId -> chosen size, in the order picked
  const [picks, setPicks] = useState(() => new Map());

  const pkg = data?.packages.find((p) => p.id === id);
  const perStone = pkg?.build === 'one-per-stone';
  const products = useMemo(() => data?.products ?? [], [data]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const chosen = [...picks.entries()].map(([productId, size]) => ({ product: byId.get(productId), size })).filter((c) => c.product);
  const total = chosen.reduce((sum, { product, size }) => sum + product.price + getCustomization(product, size).fee, 0);
  const complete = pkg && chosen.length === pkg.pieces;

  if (data && (!pkg || !pkg.build)) return <Navigate to="/shop" replace />;

  function toggle(product) {
    setPicks((current) => {
      const next = new Map(current);
      if (next.has(product.id)) {
        next.delete(product.id);
        return next;
      }
      // One per stone: picking a new piece replaces the earlier pick for that stone.
      if (perStone) {
        for (const productId of next.keys()) if (byId.get(productId)?.stone === product.stone) next.delete(productId);
      } else if (next.size >= pkg.pieces) {
        return current;
      }
      next.set(product.id, product.defaultSize);
      return next;
    });
  }

  function setSize(productId, size) {
    setPicks((current) => new Map(current).set(productId, size));
  }

  async function addBundle() {
    if (!complete || !(await requireLogin(`add the ${pkg.name} to your bag`))) return;
    const added = chosen.filter(({ product, size }) => addItem(product, { size, silent: true }));
    if (added.length === chosen.length) {
      showToast(`${pkg.name} added to your bag (${added.length} pieces).`, { type: 'success' });
      navigate('/cart');
    }
  }

  const sections = perStone
    ? STONE_ORDER.map((stone) => ({ key: stone, title: `${stoneTheme(stone).color} · ${stone[0].toUpperCase()}${stone.slice(1)} Stone`,
      items: products.filter((p) => p.stone === stone) }))
    : [{ key: 'all', title: null, items: products }];
  const pickedStones = new Set(chosen.map(({ product }) => product.stone));
  const actionLabel = complete ? 'Add bundle to cart' : `Pick ${pkg ? pkg.pieces - chosen.length : ''} more`;

  return (
    <PageContainer title={pkg?.name ?? 'Build your bundle'}>
      <PageHeader eyebrow="Build your bundle" title={pkg?.name ?? 'Loading…'}
        subtitle={pkg && (perStone ? 'Pick one piece for each of the six stones.' : `Pick any ${pkg.pieces} pieces. Mix stones and types as you like.`)} />

      {error ? (
        <p role="alert">Pieces are unavailable. <button type="button" onClick={reload}>Retry</button></p>
      ) : !data ? (
        <Skeleton height={420} />
      ) : (
        <div className="bundle-layout">
          <div>
            {sections.map((section) => (
              <section key={section.key} className="bundle-section" aria-label={section.title ?? 'All pieces'}>
                {section.title && (
                  <h2 className="bundle-section__title">
                    {section.title} {pickedStones.has(section.key) && <Check size={16} aria-label="picked" />}
                  </h2>
                )}
                <ul className="bundle-grid" role="list">
                  {section.items.map((product) => (
                    <BundlePiece key={product.id} product={product} picked={picks.has(product.id)} size={picks.get(product.id)}
                      onToggle={toggle} onSize={setSize} disabled={!perStone && picks.size >= pkg.pieces} />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <aside className="summary-card bundle-summary" aria-labelledby="bundle-summary-title">
            <h2 id="bundle-summary-title" className="summary-card__title">{pkg.name}</h2>
            <p role="status">{chosen.length} of {pkg.pieces} pieces selected</p>
            {chosen.length > 0 && (
              <ul className="bundle-summary__list" role="list">
                {chosen.map(({ product, size }) => (
                  <li key={product.id}>
                    <span>{product.name}{product.sizes?.length > 1 ? ` · ${size}` : ''}</span>
                    <span>{formatPrice(product.price + getCustomization(product, size).fee)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="bundle-summary__total"><span>Total</span><strong>{formatPrice(total)}</strong></p>
            <p className="muted bundle-summary__note">{pkg.includes}. Shipping is added at checkout.</p>
            <Button size="lg" fullWidth icon={ShoppingBag} disabled={!complete} onClick={addBundle}>
              {actionLabel}
            </Button>
          </aside>

          {/* Phones/tablets: keep progress, total and the button in reach while scrolling the pieces. */}
          <div className="bundle-bar">
            <p className="bundle-bar__status">
              <span>{chosen.length} of {pkg.pieces} selected</span>
              <strong>{formatPrice(total)}</strong>
            </p>
            <Button icon={ShoppingBag} disabled={!complete} onClick={addBundle}>
              {complete ? 'Add to cart' : actionLabel}
            </Button>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
