import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, PackageX } from 'lucide-react';
import AdminHeader from '../../components/admin/AdminHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import ProductMedia from '../../components/product/ProductMedia';
import { useToast } from '../../context/ToastContext';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import {
  getProducts,
  getCollections,
  getSizePreset,
  createProduct,
  updateProduct,
  deleteProduct,
  JEWELRY_TYPES,
  MATERIALS,
} from '../../services/productService';
import { formatPrice } from '../../utils/formatPrice';
import { STONE_ORDER, stoneTheme } from '../../utils/stoneTheme';
import { runValidators, validateRequired } from '../../utils/validators';

const BLANK = {
  name: '',
  type: 'Ring',
  stone: 'power',
  material: '925 Sterling Silver',
  price: '',
  stock: '',
  shortDescription: '',
  customSize: false,
  customColor: false,
  customizationFee: '150',
  isFeatured: false,
};

function toForm(p) {
  return {
    ...BLANK,
    ...p,
    price: String(p.price),
    stock: String(p.stock),
    customSize: p.customizable.size,
    customColor: p.customizable.color,
    customizationFee: String(p.customizationFee || 150),
  };
}

function ProductForm({ initial, collections, onCancel, onSave, saving }) {
  const gemstoneFor = (stone) => collections.find((c) => c.stone === stone)?.gemstone ?? '';
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState({});
  const set = (name, value) => {
    setV((x) => ({ ...x, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }));
  };
  const customizable = v.customSize || v.customColor;

  function handleSubmit(e) {
    e.preventDefault();
    const result = runValidators(v, {
      name: (x) => validateRequired(x, 'Product name'),
      price: (x) => (Number(x) >= 1 ? '' : 'Enter a price of at least ₱1.'),
      stock: (x) => (x !== '' && Number.isInteger(Number(x)) && Number(x) >= 0 ? '' : 'Stock must be 0 or more.'),
      shortDescription: (x) => validateRequired(x, 'Short description'),
      customizationFee: (x) => (!customizable || (Number(x) >= 100 && Number(x) <= 300) ? '' : 'Fee must be between ₱100 and ₱300.'),
    });
    setErrors(result);
    if (Object.keys(result).length) return;
    const theme = stoneTheme(v.stone);
    onSave({
      name: v.name.trim(),
      type: v.type,
      stone: v.stone,
      color: theme.color,
      gemstone: gemstoneFor(v.stone),
      material: v.material,
      price: Number(v.price),
      stock: Number(v.stock),
      shortDescription: v.shortDescription.trim(),
      details: v.details && v.id ? v.details : v.shortDescription.trim(),
      customizable: { size: v.customSize, color: v.customColor },
      customizationFee: customizable ? Number(v.customizationFee) : 0,
      isFeatured: v.isFeatured,
      ...getSizePreset(v.type),
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="form-grid form-grid--2">
      <Input label="Product name" className="span-2" value={v.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
      <Select
        label="Jewelry type"
        value={v.type}
        onChange={(e) => set('type', e.target.value)}
        options={JEWELRY_TYPES.map((t) => ({ value: t, label: t }))}
      />
      <Select
        label="Stone"
        value={v.stone}
        onChange={(e) => set('stone', e.target.value)}
        options={STONE_ORDER.map((s) => ({ value: s, label: `${stoneTheme(s).color} · ${gemstoneFor(s)}` }))}
      />
      <Select
        label="Material"
        value={v.material}
        onChange={(e) => set('material', e.target.value)}
        options={MATERIALS.map((m) => ({ value: m, label: m }))}
      />
      <Input
        label="Price (₱)"
        type="number"
        inputMode="numeric"
        min="1"
        value={v.price}
        onChange={(e) => set('price', e.target.value)}
        error={errors.price}
      />
      <Input
        label="Stock"
        type="number"
        inputMode="numeric"
        min="0"
        value={v.stock}
        onChange={(e) => set('stock', e.target.value)}
        error={errors.stock}
      />
      <Input
        label="Customization fee (₱)"
        type="number"
        min="100"
        max="300"
        value={v.customizationFee}
        onChange={(e) => set('customizationFee', e.target.value)}
        error={errors.customizationFee}
        disabled={!customizable}
        hint="₱100–₱300, applies when size or color differs from default"
      />
      <div className="field span-2">
        <label className="field__label" htmlFor="pf-desc">
          Short description
        </label>
        <textarea
          id="pf-desc"
          className="field__input"
          rows={3}
          value={v.shortDescription}
          onChange={(e) => set('shortDescription', e.target.value)}
          aria-invalid={errors.shortDescription ? 'true' : undefined}
        />
        {errors.shortDescription && (
          <p className="field__error" role="alert">
            {errors.shortDescription}
          </p>
        )}
      </div>
      <fieldset className="span-2" style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '0 24px' }}>
        <legend className="field__label">Options</legend>
        <label className="checkbox">
          <input type="checkbox" checked={v.customSize} onChange={(e) => set('customSize', e.target.checked)} /> Size customization
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={v.customColor} onChange={(e) => set('customColor', e.target.checked)} /> Stone-color customization
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={v.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} /> Featured on home page
        </label>
      </fieldset>
      <div className="span-2" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {v.id ? 'Save changes' : 'Add product'}
        </Button>
      </div>
    </form>
  );
}

export default function Products() {
  useDocumentTitle('Admin · Products');
  const { showToast } = useToast();
  const { data, loading, reload } = useServiceData(() => getProducts({ sort: 'featured' }).then((r) => r.items));
  const { data: collections } = useServiceData(getCollections);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [stone, setStone] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (p) =>
        (!q || `${p.name} ${p.gemstone} ${p.material}`.toLowerCase().includes(q)) &&
        (!type || p.type === type) &&
        (!stone || p.stone === stone),
    );
  }, [data, query, type, stone]);

  async function handleSave(payload) {
    setBusy(true);
    try {
      if (editing.id) await updateProduct(editing.id, payload);
      else await createProduct(payload);
      showToast(editing.id ? 'Product updated.' : 'Product added to the catalog.', { type: 'success' });
      setEditing(null);
      reload();
    } catch (err) {
      showToast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteProduct(deleting.id);
      showToast(`${deleting.name} deleted.`, { type: 'success' });
      setDeleting(null);
      reload();
    } catch (err) {
      showToast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminHeader title="Products" subtitle={`${data?.length ?? '–'} pieces in the catalog`}>
        <Button icon={Plus} onClick={() => setEditing(BLANK)}>
          Add product
        </Button>
      </AdminHeader>

      <div className="admin-toolbar">
        <Input
          label="Search"
          icon={Search}
          placeholder="Name, gemstone, material…"
          className="field--grow"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={[{ value: '', label: 'All types' }, ...JEWELRY_TYPES.map((t) => ({ value: t, label: t }))]}
        />
        <Select
          label="Stone"
          value={stone}
          onChange={(e) => setStone(e.target.value)}
          options={[{ value: '', label: 'All stones' }, ...STONE_ORDER.map((s) => ({ value: s, label: stoneTheme(s).color }))]}
        />
      </div>
      <p className="admin-note">Prototype: changes apply to the mock catalog until the page is reloaded.</p>

      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : rows.length ? (
        <div className="table-wrap">
          <table className="rtable">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Stone</th>
                <th scope="col">Material</th>
                <th scope="col" className="num">
                  Price
                </th>
                <th scope="col" className="num">
                  Stock
                </th>
                <th scope="col">Options</th>
                <th scope="col" className="num">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td data-label="Product">
                    <span className="cell-product">
                      <span className="cell-product__thumb">
                        <ProductMedia product={p} />
                      </span>
                      <span>
                        <Link to={`/product/${p.slug}`} className="cell-product__name">
                          {p.name}
                        </Link>
                        <span className="cell-product__sub" style={{ display: 'block' }}>
                          {p.type}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td data-label="Stone">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className="stone-dot" style={{ background: stoneTheme(p.stone).base }} aria-hidden="true" />
                      {p.color}
                    </span>
                  </td>
                  <td data-label="Material">{p.material}</td>
                  <td data-label="Price" className="num strong">
                    {formatPrice(p.price)}
                  </td>
                  <td data-label="Stock" className="num">
                    <span className={p.stock === 0 ? 'stock-out' : p.stock <= 5 ? 'stock-low' : ''}>{p.stock === 0 ? 'Out' : p.stock}</span>
                  </td>
                  <td data-label="Options">
                    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {p.isFeatured && <Badge variant="bronze">Featured</Badge>}
                      {(p.customizable.size || p.customizable.color) && <Badge variant="neutral">Custom</Badge>}
                    </span>
                  </td>
                  <td data-label="Actions" className="num">
                    <span className="cell-actions">
                      <button type="button" className="icon-btn" onClick={() => setEditing(toForm(p))} aria-label={`Edit ${p.name}`}>
                        <Pencil size={16} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger"
                        onClick={() => setDeleting(p)}
                        aria-label={`Delete ${p.name}`}
                      >
                        <Trash2 size={16} strokeWidth={1.5} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState compact icon={PackageX} title="No products match" message="Try a different search or filter." />
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit product' : 'Add product'} size="lg">
        {editing && (
          <ProductForm
            initial={editing}
            collections={collections ?? []}
            onCancel={() => setEditing(null)}
            onSave={handleSave}
            saving={busy}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete product?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={handleDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="muted">
          <strong>{deleting?.name}</strong> will be removed from the catalog for this session.
        </p>
      </Modal>
    </>
  );
}
