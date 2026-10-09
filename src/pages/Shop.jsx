import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X, SearchX } from 'lucide-react';
import PageContainer, { PageHeader } from '../components/layout/PageContainer';
import ProductGrid from '../components/product/ProductGrid';
import FilterSidebar from '../components/product/FilterSidebar';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { getProducts, getCollections, JEWELRY_TYPES, MATERIALS, SORT_OPTIONS } from '../services/productService';
import { stoneTheme, STONE_ORDER } from '../utils/stoneTheme';
import { formatPriceShort } from '../utils/formatPrice';
import './Shop.css';

const list = (value, allowed) =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => allowed.includes(v));

function parseFilters(sp) {
  return {
    q: sp.get('q') ?? '',
    types: list(sp.get('type'), JEWELRY_TYPES),
    stones: list(sp.get('stone'), STONE_ORDER),
    materials: list(sp.get('material'), MATERIALS),
    minPrice: sp.get('min') ?? '',
    maxPrice: sp.get('max') ?? '',
    inStock: sp.get('instock') === '1',
    customizable: sp.get('customizable') === '1',
    sort: SORT_OPTIONS.some((o) => o.value === sp.get('sort')) ? sp.get('sort') : 'featured',
  };
}

function toParams(f) {
  const sp = new URLSearchParams();
  if (f.q) sp.set('q', f.q);
  if (f.types.length) sp.set('type', f.types.join(','));
  if (f.stones.length) sp.set('stone', f.stones.join(','));
  if (f.materials.length) sp.set('material', f.materials.join(','));
  if (f.minPrice !== '') sp.set('min', f.minPrice);
  if (f.maxPrice !== '') sp.set('max', f.maxPrice);
  if (f.inStock) sp.set('instock', '1');
  if (f.customizable) sp.set('customizable', '1');
  if (f.sort && f.sort !== 'featured') sp.set('sort', f.sort);
  return sp;
}

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryString = searchParams.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(queryString)), [queryString]);

  const [results, setResults] = useState({ key: null, items: [] });
  const loading = results.key !== queryString;
  const products = results.items;
  const [collections, setCollections] = useState([]);
  const [searchText, setSearchText] = useState(filters.q);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const update = useCallback(
    (patch) => {
      setSearchParams(toParams({ ...filters, ...patch }), { replace: true });
    },
    [filters, setSearchParams],
  );

  useEffect(() => {
    let active = true;
    getCollections().then((c) => active && setCollections(c));
    return () => {
      active = false;
    };
  }, []);

  // Fetch whenever the URL filters change.
  useEffect(() => {
    let active = true;
    getProducts(filters).then(({ items }) => {
      if (active) setResults({ key: queryString, items });
    });
    return () => {
      active = false;
    };
  }, [filters, queryString]);

  // Sync the search box when the URL changes (e.g. from the navbar search overlay).
  const [syncedQ, setSyncedQ] = useState(filters.q);
  if (syncedQ !== filters.q) {
    setSyncedQ(filters.q);
    setSearchText(filters.q);
  }

  // Debounce typing into the URL.
  useEffect(() => {
    if (searchText === filters.q) return undefined;
    const timer = setTimeout(() => update({ q: searchText.trim() }), 350);
    return () => clearTimeout(timer);
  }, [searchText, filters.q, update]);

  const chips = useMemo(() => {
    const out = [];
    if (filters.q) out.push({ key: 'q', label: `“${filters.q}”`, remove: { q: '' } });
    filters.types.forEach((t) => out.push({ key: `t-${t}`, label: t, remove: { types: filters.types.filter((x) => x !== t) } }));
    filters.stones.forEach((s) =>
      out.push({ key: `s-${s}`, label: stoneTheme(s).color, stone: s, remove: { stones: filters.stones.filter((x) => x !== s) } }),
    );
    filters.materials.forEach((m) =>
      out.push({ key: `m-${m}`, label: m, remove: { materials: filters.materials.filter((x) => x !== m) } }),
    );
    if (filters.minPrice !== '' || filters.maxPrice !== '') {
      const label = `${filters.minPrice !== '' ? formatPriceShort(filters.minPrice) : '₱0'} – ${filters.maxPrice !== '' ? formatPriceShort(filters.maxPrice) : 'any'}`;
      out.push({ key: 'price', label, remove: { minPrice: '', maxPrice: '' } });
    }
    if (filters.inStock) out.push({ key: 'stock', label: 'In stock', remove: { inStock: false } });
    if (filters.customizable) out.push({ key: 'custom', label: 'Customizable', remove: { customizable: false } });
    return out;
  }, [filters]);

  function clearAll() {
    setSearchText('');
    setSearchParams(filters.sort !== 'featured' ? { sort: filters.sort } : {}, { replace: true });
  }

  const singleStone = filters.stones.length === 1 ? filters.stones[0] : null;
  const typeValue = filters.types.length === 1 ? filters.types[0] : filters.types.length ? 'multiple' : '';

  const sidebar = (
    <FilterSidebar filters={filters} onChange={update} collections={collections} types={JEWELRY_TYPES} materials={MATERIALS} />
  );

  return (
    <PageContainer title="Shop">
      <PageHeader title="Shop Avengems" subtitle="Find the piece that matches your stone." />

      {/* Quick stone pills */}
      <div className="stone-pills" role="group" aria-label="Filter by stone color">
        <button
          type="button"
          className={`pill ${!filters.stones.length ? 'is-active' : ''}`}
          aria-pressed={!filters.stones.length}
          onClick={() => update({ stones: [] })}
        >
          All stones
        </button>
        {STONE_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            className={`pill ${singleStone === s ? 'is-active' : ''}`}
            aria-pressed={singleStone === s}
            onClick={() => update({ stones: singleStone === s ? [] : [s] })}
          >
            <span className="stone-dot" style={{ background: stoneTheme(s).base }} aria-hidden="true" />
            {stoneTheme(s).color}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="shop-toolbar">
        <div className="shop-search" role="search">
          <Search size={18} strokeWidth={1.5} aria-hidden="true" />
          <label htmlFor="shop-search" className="visually-hidden">
            Search products
          </label>
          <input
            id="shop-search"
            type="search"
            placeholder="Search your next piece…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && update({ q: searchText.trim() })}
          />
          {searchText && (
            <button type="button" className="shop-search__clear" aria-label="Clear search" onClick={() => setSearchText('')}>
              <X size={16} strokeWidth={1.6} />
            </button>
          )}
        </div>
        <Select
          label="Jewelry type"
          hideLabel
          className="shop-toolbar__type"
          value={typeValue}
          onChange={(e) => e.target.value !== 'multiple' && update({ types: e.target.value ? [e.target.value] : [] })}
          options={[
            { value: '', label: 'All jewelry' },
            ...JEWELRY_TYPES.map((t) => ({ value: t, label: t === 'Earrings' ? 'Earrings' : `${t}s` })),
            ...(typeValue === 'multiple' ? [{ value: 'multiple', label: 'Multiple types' }] : []),
          ]}
        />
        <Select
          label="Sort by"
          hideLabel
          className="shop-toolbar__sort"
          value={filters.sort}
          onChange={(e) => update({ sort: e.target.value })}
          options={SORT_OPTIONS}
        />
        <Button variant="outline" icon={SlidersHorizontal} className="shop-toolbar__filters" onClick={() => setDrawerOpen(true)}>
          Filters{chips.length ? ` (${chips.length})` : ''}
        </Button>
      </div>

      <div className="shop-layout">
        <aside className="shop-sidebar" aria-label="Product filters">
          {sidebar}
        </aside>

        <section className="shop-results" aria-labelledby="results-count">
          <div className="shop-results__head">
            <p id="results-count" className="shop-results__count" aria-live="polite">
              {loading ? 'Loading pieces…' : `${products.length} ${products.length === 1 ? 'piece' : 'pieces'}`}
            </p>
            <p className="shop-results__note">Concept collection · Illustrative product visuals</p>
          </div>

          {chips.length > 0 && (
            <div className="filter-chips" aria-label="Active filters">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="filter-chip"
                  onClick={() => update(chip.remove)}
                  aria-label={`Remove filter ${chip.label}`}
                >
                  {chip.stone && <span className="stone-dot" style={{ background: stoneTheme(chip.stone).base }} aria-hidden="true" />}
                  {chip.label}
                  <X size={14} strokeWidth={1.6} aria-hidden="true" />
                </button>
              ))}
              <button type="button" className="filter-chips__clear" onClick={clearAll}>
                Clear all
              </button>
            </div>
          )}

          <ProductGrid
            products={products}
            loading={loading}
            skeletonCount={8}
            empty={
              <EmptyState
                icon={SearchX}
                title="No pieces match your search"
                message="Try a different stone, widen your price range, or clear your filters to see the full collection."
              >
                <Button onClick={clearAll}>Clear filters</Button>
              </EmptyState>
            }
          />
        </section>
      </div>

      <Modal
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filters"
        variant="sheet"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={clearAll}>
              Clear all
            </Button>
            <Button onClick={() => setDrawerOpen(false)}>Show {products.length} results</Button>
          </>
        }
      >
        {sidebar}
      </Modal>
    </PageContainer>
  );
}
