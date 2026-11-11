import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ORDER_STATUSES } from '../services/orderService';
import { orderReference } from '../utils/orderReference';
import { ADMIN_ORDER_PAGE_SIZES } from '../config/store';

const SORT_KEYS = ['date', 'ref', 'total', 'status'];
const DEFAULTS = { q: '', status: 'All', pay: 'all', from: '', to: '', sort: 'date', dir: 'desc', page: 1, size: ADMIN_ORDER_PAGE_SIZES[0] };
// Each sort has a natural direction: newest dates first, everything else ascending.
const defaultDir = (sort) => (sort === 'date' ? 'desc' : 'asc');
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function readParams(sp) {
  const sort = SORT_KEYS.includes(sp.get('sort')) ? sp.get('sort') : DEFAULTS.sort;
  const size = Number(sp.get('size'));
  return {
    q: sp.get('q') ?? '',
    status: ['All', ...ORDER_STATUSES].includes(sp.get('status')) ? sp.get('status') : DEFAULTS.status,
    pay: sp.get('pay') || DEFAULTS.pay,
    from: isDate(sp.get('from') ?? '') ? sp.get('from') : '',
    to: isDate(sp.get('to') ?? '') ? sp.get('to') : '',
    sort,
    dir: sp.get('dir') === 'asc' || sp.get('dir') === 'desc' ? sp.get('dir') : defaultDir(sort),
    page: Math.max(1, Number.parseInt(sp.get('page'), 10) || 1),
    size: ADMIN_ORDER_PAGE_SIZES.includes(size) ? size : DEFAULTS.size,
  };
}

function writeParams(params) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'dir') continue;
    if (value !== DEFAULTS[key] && value !== '' && value != null) sp.set(key, String(value));
  }
  // dir is implied by each sort's natural direction; write it only when it differs from that.
  if (params.dir !== defaultDir(params.sort)) sp.set('dir', params.dir);
  return sp;
}

const startOfDay = (d) => new Date(`${d}T00:00:00`).getTime();
const endOfDay = (d) => new Date(`${d}T23:59:59.999`).getTime();
const refNumber = (o) => {
  const match = /(\d+)$/.exec(orderReference(o));
  return match ? Number(match[1]) : 0;
};

const COMPARE = {
  date: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  total: (a, b) => a.total - b.total,
  status: (a, b) => ORDER_STATUSES.indexOf(a.status) - ORDER_STATUSES.indexOf(b.status),
  ref: (a, b) => refNumber(a) - refNumber(b) || orderReference(a).localeCompare(orderReference(b)),
};

/**
 * Search, filters, sort and pagination for admin order tables, all kept in the URL
 * (?q=&status=&pay=&from=&to=&sort=&dir=&page=&size=) so a refresh or shared link keeps the view.
 * Works on the orders the page already loaded; no extra API calls.
 */
export default function useOrderTableQuery(orders) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryString = searchParams.toString();
  const params = useMemo(() => readParams(new URLSearchParams(queryString)), [queryString]);

  const update = useCallback(
    (patch, { resetPage = true } = {}) => {
      const next = { ...params, ...patch };
      if (resetPage && !('page' in patch)) next.page = 1;
      setSearchParams(writeParams(next), { replace: true });
    },
    [params, setSearchParams],
  );

  // Debounced search box: type freely, the URL (and filtering) catches up after 300 ms.
  const [searchText, setSearchText] = useState(params.q);
  const [syncedQ, setSyncedQ] = useState(params.q);
  if (syncedQ !== params.q) {
    setSyncedQ(params.q);
    setSearchText(params.q);
  }
  useEffect(() => {
    if (searchText.trim() === params.q) return undefined;
    const timer = setTimeout(() => update({ q: searchText.trim() }), 300);
    return () => clearTimeout(timer);
  }, [searchText, params.q, update]);

  const result = useMemo(() => {
    const q = params.q.toLowerCase();
    const from = params.from ? startOfDay(params.from) : null;
    const to = params.to ? endOfDay(params.to) : null;
    // Everything except the status filter, so the status pills can show counts.
    const base = orders.filter((o) => {
      if (q && !`${orderReference(o)} ${o.id} ${o.customer?.name ?? ''} ${o.customer?.email ?? ''}`.toLowerCase().includes(q)) return false;
      if (params.pay !== 'all' && o.paymentMethod !== params.pay) return false;
      const time = new Date(o.createdAt).getTime();
      if (from != null && time < from) return false;
      if (to != null && time > to) return false;
      return true;
    });
    const counts = { All: base.length };
    for (const status of ORDER_STATUSES) counts[status] = base.filter((o) => o.status === status).length;
    const filtered = params.status === 'All' ? base : base.filter((o) => o.status === params.status);
    const direction = params.dir === 'asc' ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => COMPARE[params.sort](a, b) * direction || COMPARE.date(b, a));
    const pageCount = Math.max(1, Math.ceil(sorted.length / params.size));
    const page = Math.min(params.page, pageCount);
    const start = (page - 1) * params.size;
    return { counts, total: sorted.length, rows: sorted.slice(start, start + params.size), page, pageCount, start };
  }, [orders, params]);

  const filtersActive = Boolean(params.q || params.status !== 'All' || params.pay !== 'all' || params.from || params.to);

  return {
    params,
    searchText,
    setSearchText,
    ...result,
    filtersActive,
    setStatus: (status) => update({ status }),
    setPayment: (pay) => update({ pay }),
    setDateRange: (from, to) => update({ from, to }),
    setPage: (page) => update({ page }, { resetPage: false }),
    setPageSize: (size) => update({ size: Number(size) }),
    /** Direct choice, e.g. from the mobile "Sort by" dropdown: setSort('total', 'desc'). */
    setSort: (sort, dir) => update({ sort, dir }),
    /** Click a column: first click uses that column's natural order, the next flips it. */
    toggleSort: (key) =>
      update(params.sort === key ? { dir: params.dir === 'asc' ? 'desc' : 'asc' } : { sort: key, dir: key === 'date' || key === 'total' ? 'desc' : 'asc' }),
    clearFilters: () => {
      setSearchText('');
      setSearchParams(writeParams({ ...DEFAULTS, sort: params.sort, dir: params.dir, size: params.size }), { replace: true });
    },
  };
}

/** Value for <th aria-sort> on a sortable column. */
export const ariaSort = (query, key) =>
  query.params.sort === key ? (query.params.dir === 'asc' ? 'ascending' : 'descending') : 'none';
