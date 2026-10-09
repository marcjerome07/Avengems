import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Heart, ShoppingBag, Zap, Gem as GemIcon, PackageX, Truck, ShieldCheck } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Rating from '../components/ui/Rating';
import Accordion from '../components/ui/Accordion';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import QuantitySelector from '../components/ui/QuantitySelector';
import ProductMedia from '../components/product/ProductMedia';
import ColorSwatch from '../components/product/ColorSwatch';
import ProductGrid from '../components/product/ProductGrid';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { getProductBySlug, getRelatedProducts, getProductInfo, CUSTOMIZATION_FEE_RANGE } from '../services/productService';
import { formatPrice, formatPriceShort } from '../utils/formatPrice';
import { STONE_ORDER, stoneTheme, stoneFromColor, stoneVar } from '../utils/stoneTheme';
import { getCustomization, isCustomizable } from '../utils/customization';
import './ProductDetails.css';

const VIEW_LABELS = ['Front view', 'Close-up', 'Angled view', 'Full piece'];

function ProductView({ product }) {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { isWishlisted, toggle } = useWishlist();
  const [color, setColor] = useState(product.color);
  const [size, setSize] = useState(product.defaultSize);
  const [quantity, setQuantity] = useState(1);
  const [view, setView] = useState(0);
  const [related, setRelated] = useState(null);

  useEffect(() => {
    let active = true;
    getRelatedProducts(product, 4).then((list) => active && setRelated(list));
    return () => {
      active = false;
    };
  }, [product]);

  const stone = stoneFromColor(color);
  const outOfStock = product.stock <= 0;
  const customizable = isCustomizable(product);
  const { customized, fee } = getCustomization(product, color, size);
  const unitPrice = product.price + fee;
  const wished = isWishlisted(product.id);
  const info = getProductInfo(product);
  const photoCount = product.images?.length ?? 0;
  const views = photoCount && stone === product.stone ? product.images.map((_, i) => i) : [0, 1, 2, 3];

  function handleAdd() {
    return addItem(product, { color, size, quantity });
  }

  function handleBuyNow() {
    if (addItem(product, { color, size, quantity, silent: true })) navigate('/checkout');
  }

  const accordionItems = [
    {
      id: 'details',
      title: 'Product Details',
      content: <p>{product.details}</p>,
    },
    {
      id: 'specs',
      title: 'Specifications',
      content: (
        <dl>
          {info.specifications.map(([label, value]) => (
            <div key={label} style={{ display: 'contents' }}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ),
    },
    {
      id: 'materials',
      title: 'Materials',
      content: (
        <p>
          <strong>{product.material}.</strong> {info.materialNote} Stone: {product.gemstone}.
        </p>
      ),
    },
    { id: 'packaging', title: 'Packaging', content: <p>{info.packaging}</p> },
    {
      id: 'shipping',
      title: 'Shipping Information',
      content: (
        <ul>
          {info.shipping.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ),
    },
    {
      id: 'care',
      title: 'Care Information',
      content: (
        <ul>
          {info.care.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <>
      <nav aria-label="Breadcrumb">
        <ol className="breadcrumbs">
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/shop">Shop</Link>
          </li>
          <li>
            <Link to={`/collections/${product.stone}`}>{stoneTheme(product.stone).color}</Link>
          </li>
          <li aria-current="page">{product.name}</li>
        </ol>
      </nav>

      <div className="pdp">
        {/* Gallery */}
        <div className="pdp__gallery">
          <div className="pdp__main">
            <ProductMedia product={product} stone={stone} variant={view} imageIndex={view} />
            <div className="pdp__badges">
              {outOfStock && <Badge variant="oos">Out of Stock</Badge>}
              {!outOfStock && product.isNew && <Badge variant="new">New</Badge>}
              {customized && <Badge variant="custom">Customized</Badge>}
            </div>
          </div>
          <div className="pdp__thumbs" role="group" aria-label="Product views">
            {views.map((v) => (
              <button
                key={v}
                type="button"
                className={`pdp__thumb ${view === v ? 'is-active' : ''}`}
                onClick={() => setView(v)}
                aria-label={VIEW_LABELS[v] ?? `Photo ${v + 1}`}
                aria-pressed={view === v}
              >
                <ProductMedia product={product} stone={stone} variant={v} imageIndex={v} />
              </button>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="pdp__info">
          <p className="pdp__meta">
            <span className="stone-dot" style={{ background: stoneVar(product.stone) }} aria-hidden="true" />
            {product.type} · {stoneTheme(product.stone).color} Stone Collection
          </p>
          <h1 className="pdp__name">{product.name}</h1>
          <Rating value={product.rating} count={product.reviewCount} showValue size={16} />

          <div className="pdp__price-row">
            <p className="pdp__price" aria-live="polite">
              {formatPrice(unitPrice)}
            </p>
            {fee > 0 && (
              <p className="pdp__price-base">
                Base {formatPrice(product.price)} + {formatPrice(fee)} customization
              </p>
            )}
          </div>

          <p className="pdp__desc">{product.shortDescription}</p>

          <dl className="pdp__facts">
            <div>
              <dt>Material</dt>
              <dd>{product.material}</dd>
            </div>
            <div>
              <dt>Gemstone</dt>
              <dd>{product.gemstone}</dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd className={outOfStock ? 'is-oos' : 'is-in'}>
                {outOfStock ? 'Out of stock' : product.stock <= 5 ? `Only ${product.stock} left` : 'In stock'}
              </dd>
            </div>
            {!product.customizable.size && (
              <div>
                <dt>Size</dt>
                <dd>{product.defaultSize} (standard)</dd>
              </div>
            )}
          </dl>

          {customizable && (
            <section className="customize" aria-labelledby="customize-title">
              <div className="customize__head">
                <h2 id="customize-title" className="customize__title">
                  <GemIcon size={18} strokeWidth={1.4} aria-hidden="true" /> Customize Your Piece
                </h2>
                <p className="customize__fee">
                  Customization Fee: {formatPriceShort(CUSTOMIZATION_FEE_RANGE.min)}–{formatPriceShort(CUSTOMIZATION_FEE_RANGE.max)}
                </p>
              </div>

              {product.customizable.size && (
                <fieldset className="customize__group">
                  <legend>
                    Size <span>· {size}</span>
                  </legend>
                  <div className="size-options" role="radiogroup" aria-label="Size">
                    {product.sizes.map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={size === s}
                        className={`size-option ${size === s ? 'is-selected' : ''}`}
                        onClick={() => setSize(s)}
                      >
                        {s}
                        {s === product.defaultSize && <span className="size-option__std">std</span>}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {product.customizable.color && (
                <fieldset className="customize__group">
                  <legend>
                    Gemstone Color <span>· {color}</span>
                  </legend>
                  <div className="color-options" role="radiogroup" aria-label="Gemstone color">
                    {STONE_ORDER.map((s) => (
                      <ColorSwatch
                        key={s}
                        stone={s}
                        role="radio"
                        showLabel
                        selected={stone === s}
                        onClick={() => setColor(stoneTheme(s).color)}
                      />
                    ))}
                  </div>
                </fieldset>
              )}

              <div className="customize__summary" aria-live="polite">
                <p className="customize__summary-title">Your selection</p>
                <ul role="list">
                  <li>
                    <span>Stone color</span>
                    <span>
                      <span className="stone-dot" style={{ background: stoneVar(stone) }} aria-hidden="true" /> {color}
                    </span>
                  </li>
                  <li>
                    <span>Size</span>
                    <span>{size}</span>
                  </li>
                  <li>
                    <span>Customization fee</span>
                    <span>{fee > 0 ? formatPrice(fee) : 'None (standard options)'}</span>
                  </li>
                  <li className="customize__total">
                    <span>Total per piece</span>
                    <span>{formatPrice(unitPrice)}</span>
                  </li>
                </ul>
                {!customized && (
                  <p className="customize__hint">
                    Change the size or stone color to customize this piece for {formatPrice(product.customizationFee)}.
                  </p>
                )}
              </div>
            </section>
          )}

          <div className="pdp__buy">
            <QuantitySelector
              value={quantity}
              onChange={setQuantity}
              max={Math.max(1, Math.min(10, product.stock))}
              disabled={outOfStock}
            />
            <Button icon={ShoppingBag} size="lg" onClick={handleAdd} disabled={outOfStock} className="pdp__add">
              {outOfStock ? 'Out of Stock' : 'Add to Cart'}
            </Button>
            <button
              type="button"
              className={`pdp__wish ${wished ? 'is-active' : ''}`}
              onClick={() => toggle(product)}
              aria-pressed={wished}
              aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              <Heart size={20} strokeWidth={1.5} />
            </button>
          </div>
          <Button variant="outline" size="lg" icon={Zap} fullWidth onClick={handleBuyNow} disabled={outOfStock}>
            Buy Now
          </Button>

          {outOfStock && (
            <p className="pdp__oos-note" role="status">
              This piece is out of stock right now. Save it to your wishlist and check back soon.
            </p>
          )}

          <ul className="pdp__perks" role="list">
            <li>
              <Truck size={18} strokeWidth={1.4} aria-hidden="true" /> Free shipping on orders ₱2,000+
            </li>
            <li>
              <ShieldCheck size={18} strokeWidth={1.4} aria-hidden="true" /> Hypoallergenic, nickel-free metals
            </li>
          </ul>

          <Accordion items={accordionItems} defaultOpen={['details']} />
        </div>
      </div>

      <section className="section--tight pdp__related" aria-labelledby="related-title">
        <div className="section-head">
          <div>
            <span className="section-eyebrow">Complete the look</span>
            <h2 id="related-title" className="section-title">
              You may also like
            </h2>
          </div>
        </div>
        <ProductGrid products={related ?? []} loading={!related} skeletonCount={4} />
      </section>
    </>
  );
}

export default function ProductDetails() {
  const { slug } = useParams();
  const [result, setResult] = useState({ slug: null, status: 'loading', product: null });
  // Anything fetched for a previous slug counts as still loading.
  const state = result.slug === slug ? result : { status: 'loading', product: null };

  useEffect(() => {
    let active = true;
    getProductBySlug(slug)
      .then((product) => active && setResult({ slug, status: 'ready', product }))
      .catch(() => active && setResult({ slug, status: 'missing', product: null }));
    return () => {
      active = false;
    };
  }, [slug]);

  if (state.status === 'missing') {
    return (
      <PageContainer title="Product unavailable">
        <EmptyState
          headingLevel={1}
          icon={PackageX}
          title="Product unavailable"
          message="This piece may have been moved or is no longer part of the collection. Explore the rest of our stones instead."
        >
          <Button to="/shop">Browse the shop</Button>
          <Button to="/collections" variant="outline">
            View collections
          </Button>
        </EmptyState>
      </PageContainer>
    );
  }

  if (state.status === 'loading') {
    return (
      <PageContainer title="Loading…">
        <div className="pdp" role="status" aria-label="Loading product">
          <Skeleton className="pdp__skeleton-media" height="auto" />
          <div className="pdp__info">
            <Skeleton width="40%" height={14} />
            <Skeleton width="75%" height={44} />
            <Skeleton width="30%" height={16} />
            <Skeleton width="25%" height={28} />
            <Skeleton height={80} />
            <Skeleton height={52} />
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title={state.product.name}>
      <ProductView key={state.product.id} product={state.product} />
    </PageContainer>
  );
}
