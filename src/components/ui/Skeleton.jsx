import './Skeleton.css';

export default function Skeleton({ width = '100%', height = 16, radius, className = '', style }) {
  return <span className={`skeleton ${className}`} style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

export function ProductCardSkeleton() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <Skeleton className="skeleton-card__image" height="auto" />
      <Skeleton width="45%" height={12} />
      <Skeleton width="80%" height={18} />
      <Skeleton width="30%" height={14} />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }) {
  return (
    <div className="product-grid" role="status" aria-label="Loading products">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <div className="skeleton-table" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="skeleton-table__row" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} height={14} width={c === 0 ? '70%' : '55%'} />
          ))}
        </div>
      ))}
    </div>
  );
}
