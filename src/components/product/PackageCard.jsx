import { ArrowRight, Sparkles } from 'lucide-react';
import Button from '../ui/Button';
import { formatPrice, formatPriceRange } from '../../utils/formatPrice';
import './PackageCard.css';

/**
 * fromPrice: lowest bundle total from the live catalog; range: live { min, max } for per-piece packages
 * (see utils/bundles). Without them the card falls back to the package's static price text.
 */
export default function PackageCard({ pkg, fromPrice = null, range = null }) {
  const price = fromPrice != null ? `From ${formatPrice(fromPrice)}`
    : range ? formatPriceRange(range.min, range.max)
      : pkg.priceLabel ?? formatPriceRange(pkg.priceMin, pkg.priceMax);
  return (
    <article className={`package-card ${pkg.signature ? 'package-card--signature' : ''}`}>
      {pkg.signature && (
        <span className="package-card__ribbon">
          <Sparkles size={14} strokeWidth={1.5} aria-hidden="true" /> Signature
        </span>
      )}
      <h3 className="package-card__name">{pkg.name}</h3>
      <p className="package-card__includes">{pkg.includes}</p>
      <p className="package-card__pieces">
        {pkg.pieces} {pkg.pieces === 1 ? 'piece' : 'pieces'}
      </p>
      <p className="package-card__price">{price}</p>
      {fromPrice != null && <p className="package-card__price-note">{pkg.priceLabel}</p>}
      <Button to={pkg.shopLink} variant={pkg.signature ? 'primary' : 'outline'} iconRight={ArrowRight} fullWidth>
        Shop Now
      </Button>
    </article>
  );
}
