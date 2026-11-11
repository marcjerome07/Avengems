import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { ORDER_STATUSES, PAYMENT_LABELS } from '../../services/orderService';
import { ADMIN_ORDER_PAGE_SIZES } from '../../config/store';

// Same sorts as the column headers, for small screens where the table has no header row.
const SORT_CHOICES = [
  { value: 'date:desc', label: 'Newest first' },
  { value: 'date:asc', label: 'Oldest first' },
  { value: 'total:desc', label: 'Total: high to low' },
  { value: 'total:asc', label: 'Total: low to high' },
  { value: 'ref:desc', label: 'Order #: newest' },
  { value: 'ref:asc', label: 'Order #: oldest' },
  { value: 'status:asc', label: 'Status: Pending → Cancelled' },
  { value: 'status:desc', label: 'Status: Cancelled → Pending' },
];

/** Column header that sorts on click. Put inside a <th aria-sort={...}>. */
export function SortHeader({ label, sortKey, query, align }) {
  const active = query.params.sort === sortKey;
  const Icon = !active ? ChevronsUpDown : query.params.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button type="button" className={`sort-head ${active ? 'is-active' : ''} ${align === 'end' ? 'sort-head--end' : ''}`} onClick={() => query.toggleSort(sortKey)}>
      {label}
      <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
      <span className="visually-hidden">
        {active ? `, sorted ${query.params.dir === 'asc' ? 'ascending' : 'descending'}. Click to reverse.` : ', click to sort'}
      </span>
    </button>
  );
}

/** Status pills with counts, search, payment method, date range and "Clear filters". */
export function OrderFilters({ query, loading }) {
  const { params, counts } = query;
  return (
    <div className="order-filters">
      <div className="status-tabs order-filters__status" role="group" aria-label="Filter by status">
        {['All', ...ORDER_STATUSES].map((s) => (
          <button key={s} type="button" className={`pill ${params.status === s ? 'is-active' : ''}`} aria-pressed={params.status === s} onClick={() => query.setStatus(s)}>
            {s} <span className="status-tabs__count">{loading ? '' : counts[s] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="admin-toolbar order-filters__row">
        <Input
          label="Search orders"
          icon={Search}
          placeholder="Order number, customer name or email…"
          className="field--grow"
          value={query.searchText}
          onChange={(e) => query.setSearchText(e.target.value)}
        />
        <Select
          label="Payment method"
          value={params.pay}
          onChange={(e) => query.setPayment(e.target.value)}
          options={[{ value: 'all', label: 'All methods' }, ...Object.entries(PAYMENT_LABELS).map(([value, label]) => ({ value, label }))]}
        />
        <Select
          label="Sort by"
          className="order-filters__sort"
          value={`${params.sort}:${params.dir}`}
          onChange={(e) => {
            const [sort, dir] = e.target.value.split(':');
            query.setSort(sort, dir);
          }}
          options={SORT_CHOICES}
        />
        <Input label="From" type="date" value={params.from} max={params.to || undefined} onChange={(e) => query.setDateRange(e.target.value, params.to)} />
        <Input label="To" type="date" value={params.to} min={params.from || undefined} onChange={(e) => query.setDateRange(params.from, e.target.value)} />
        {query.filtersActive && (
          <Button variant="ghost" icon={X} onClick={query.clearFilters} className="order-filters__clear">
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}

/** "Showing 1–10 of 34" + page size + previous/next. */
export function OrderPagination({ query }) {
  const { total, page, pageCount, start, rows, params } = query;
  if (!total) return null;
  return (
    <div className="order-pagination">
      <p className="order-pagination__summary" aria-live="polite">
        Showing {start + 1}–{start + rows.length} of {total} {total === 1 ? 'order' : 'orders'}
      </p>
      <div className="order-pagination__controls">
        <Select
          label="Rows per page"
          className="order-pagination__size"
          value={String(params.size)}
          onChange={(e) => query.setPageSize(e.target.value)}
          options={ADMIN_ORDER_PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` }))}
          hideLabel
        />
        <button type="button" className="icon-btn" onClick={() => query.setPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft size={18} />
        </button>
        <span className="order-pagination__page">
          Page {page} of {pageCount}
        </span>
        <button type="button" className="icon-btn" onClick={() => query.setPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
