import { Star } from 'lucide-react';
import './Rating.css';

export default function Rating({ value = 0, count, size = 14, showValue = false }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <div className="rating" aria-label={`Rated ${value.toFixed(1)} out of 5${count != null ? `, ${count} reviews` : ''}`}>
      <span className="rating__stars" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => {
          const fill = rounded >= i + 1 ? 1 : rounded >= i + 0.5 ? 0.5 : 0;
          return (
            <span key={i} className="rating__star">
              <Star size={size} strokeWidth={1.4} className="rating__empty" />
              {fill > 0 && (
                <span className="rating__fill" style={{ width: `${fill * 100}%` }}>
                  <Star size={size} strokeWidth={1.4} />
                </span>
              )}
            </span>
          );
        })}
      </span>
      {showValue && <span className="rating__value">{value.toFixed(1)}</span>}
      {count != null && <span className="rating__count">({count})</span>}
    </div>
  );
}
