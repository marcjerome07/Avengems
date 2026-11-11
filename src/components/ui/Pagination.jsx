import { ChevronLeft, ChevronRight } from 'lucide-react';
import './Pagination.css';

/** Page numbers to show: all when few, otherwise 1 … neighbours … last. */
function pageItems(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const items = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) items.push('gap-start');
  for (let n = start; n <= end; n += 1) items.push(n);
  if (end < pageCount - 1) items.push('gap-end');
  items.push(pageCount);
  return items;
}

/** Shopee-style numbered pagination: ‹ 1 2 3 … 6 › */
export default function Pagination({ page, pageCount, onChange, label = 'Pagination' }) {
  if (pageCount <= 1) return null;
  return (
    <nav className="pager" aria-label={label}>
      <button type="button" className="pager__arrow" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <ChevronLeft size={18} strokeWidth={1.6} />
      </button>
      {pageItems(page, pageCount).map((item) =>
        typeof item === 'number' ? (
          <button
            key={item}
            type="button"
            className={`pager__num ${item === page ? 'is-active' : ''}`}
            onClick={() => onChange(item)}
            aria-current={item === page ? 'page' : undefined}
            aria-label={`Page ${item}`}
          >
            {item}
          </button>
        ) : (
          <span key={item} className="pager__gap" aria-hidden="true">
            …
          </span>
        ),
      )}
      <button type="button" className="pager__arrow" onClick={() => onChange(page + 1)} disabled={page >= pageCount} aria-label="Next page">
        <ChevronRight size={18} strokeWidth={1.6} />
      </button>
    </nav>
  );
}
