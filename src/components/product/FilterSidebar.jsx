import { useState } from 'react';
import ColorSwatch from './ColorSwatch';
import '../ui/Field.css';
import './FilterSidebar.css';

function toggleValue(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function FilterGroup({ title, children }) {
  return (
    <fieldset className="filter-group">
      <legend className="filter-group__title">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * filters: { types[], stones[], materials[], minPrice, maxPrice, inStock, customizable }
 * onChange(patch) merges into the URL query.
 */
export default function FilterSidebar({ filters, onChange, collections = [], types = [], materials = [] }) {
  const [min, setMin] = useState(filters.minPrice ?? '');
  const [max, setMax] = useState(filters.maxPrice ?? '');

  // Keep local price inputs in sync when filters are cleared elsewhere.
  const priceKey = `${filters.minPrice}|${filters.maxPrice}`;
  const [syncedKey, setSyncedKey] = useState(priceKey);
  if (syncedKey !== priceKey) {
    setSyncedKey(priceKey);
    setMin(filters.minPrice ?? '');
    setMax(filters.maxPrice ?? '');
  }

  function commitPrice() {
    const clean = (v) => (v === '' ? '' : String(Math.max(0, Math.round(Number(v)) || 0)));
    onChange({ minPrice: clean(min), maxPrice: clean(max) });
  }

  return (
    <div className="filters">
      <FilterGroup title="Jewelry Type">
        {types.map((type) => (
          <label key={type} className="checkbox">
            <input
              type="checkbox"
              checked={filters.types.includes(type)}
              onChange={() => onChange({ types: toggleValue(filters.types, type) })}
            />
            {type === 'Earrings' ? 'Earrings' : `${type}s`}
          </label>
        ))}
      </FilterGroup>

      <FilterGroup title="Stone Color">
        <div className="filters__swatches">
          {collections.map((c) => (
            <ColorSwatch
              key={c.stone}
              stone={c.stone}
              size="md"
              showLabel
              selected={filters.stones.includes(c.stone)}
              onClick={() => onChange({ stones: toggleValue(filters.stones, c.stone) })}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Material">
        {materials.map((m) => (
          <label key={m} className="checkbox">
            <input
              type="checkbox"
              checked={filters.materials.includes(m)}
              onChange={() => onChange({ materials: toggleValue(filters.materials, m) })}
            />
            {m}
          </label>
        ))}
      </FilterGroup>

      <FilterGroup title="Price Range (₱)">
        <div className="filters__price">
          <label className="visually-hidden" htmlFor="price-min">
            Minimum price
          </label>
          <input
            id="price-min"
            className="field__input"
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="Min"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => e.key === 'Enter' && commitPrice()}
          />
          <span aria-hidden="true">–</span>
          <label className="visually-hidden" htmlFor="price-max">
            Maximum price
          </label>
          <input
            id="price-max"
            className="field__input"
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="Max"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => e.key === 'Enter' && commitPrice()}
          />
        </div>
      </FilterGroup>

      <FilterGroup title="Availability">
        <label className="checkbox">
          <input type="checkbox" checked={filters.inStock} onChange={() => onChange({ inStock: !filters.inStock })} />
          In stock only
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={filters.customizable} onChange={() => onChange({ customizable: !filters.customizable })} />
          Customizable pieces
        </label>
      </FilterGroup>
    </div>
  );
}
