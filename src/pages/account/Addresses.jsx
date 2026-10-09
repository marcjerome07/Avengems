import { useState } from 'react';
import { MapPin, Plus, Pencil, Trash2, Star } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getAddresses, saveAddress, deleteAddress, setDefaultAddress } from '../../services/authService';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { runValidators, validateName, validatePhone, validateRequired, validatePostalCode, formatPhone } from '../../utils/validators';

const EMPTY = { label: '', fullName: '', phone: '', address: '', city: '', province: '', postalCode: '', isDefault: false };

function AddressForm({ initial, onCancel, onSave, saving }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});

  function set(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const result = runValidators(values, {
      label: (v) => validateRequired(v, 'Label'),
      fullName: validateName,
      phone: (v) => validatePhone(v),
      address: (v) => validateRequired(v, 'Address'),
      city: (v) => validateRequired(v, 'City'),
      province: (v) => validateRequired(v, 'Province'),
      postalCode: validatePostalCode,
    });
    setErrors(result);
    if (!Object.keys(result).length) onSave(values);
  }

  const f = (name) => ({ value: values[name], error: errors[name], onChange: (e) => set(name, e.target.value) });

  return (
    <form onSubmit={handleSubmit} noValidate className="form-grid form-grid--2">
      <Input label="Label" placeholder="Home, Office…" {...f('label')} />
      <Input label="Full Name" autoComplete="name" {...f('fullName')} />
      <Input
        label="Phone"
        type="tel"
        placeholder="09XX XXX XXXX"
        {...f('phone')}
        onChange={(e) => set('phone', formatPhone(e.target.value))}
      />
      <Input
        label="Postal Code"
        inputMode="numeric"
        maxLength={4}
        {...f('postalCode')}
        onChange={(e) => set('postalCode', e.target.value.replace(/\D/g, '').slice(0, 4))}
      />
      <Input label="Address" className="span-2" placeholder="House no., street, barangay" {...f('address')} />
      <Input label="City" {...f('city')} />
      <Input label="Province" {...f('province')} />
      <label className="checkbox span-2">
        <input type="checkbox" checked={values.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />
        Set as default address
      </label>
      <div className="account-form__actions span-2" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save address
        </Button>
      </div>
    </form>
  );
}

export default function Addresses() {
  useDocumentTitle('Addresses');
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data, loading, setData } = useServiceData(() => getAddresses(user.id), [user.id]);
  const [editing, setEditing] = useState(null); // address object or EMPTY for new
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const addresses = data ?? [];

  async function run(action, message) {
    setBusy(true);
    try {
      const next = await action();
      setData(next);
      showToast(message, { type: 'success' });
      return true;
    } catch (err) {
      showToast(err.message, { type: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(values) {
    const ok = await run(() => saveAddress(user.id, values), values.id ? 'Address updated.' : 'Address added.');
    if (ok) setEditing(null);
  }

  async function handleDelete() {
    const ok = await run(() => deleteAddress(user.id, confirmDelete.id), 'Address deleted.');
    if (ok) setConfirmDelete(null);
  }

  return (
    <>
      <header className="account-head">
        <div>
          <h1 className="account-title">Addresses</h1>
          <p className="account-subtitle">Saved addresses appear at checkout.</p>
        </div>
        <Button icon={Plus} onClick={() => setEditing({ ...EMPTY, fullName: user.name ?? '', phone: user.phone ?? '' })}>
          Add address
        </Button>
      </header>

      {loading ? (
        <div className="address-grid">
          <Skeleton height={200} />
          <Skeleton height={200} />
        </div>
      ) : addresses.length ? (
        <ul className="address-grid" role="list">
          {addresses.map((a) => (
            <li key={a.id} className={`address-card ${a.isDefault ? 'is-default' : ''}`}>
              <div className="address-card__head">
                <h2 className="address-card__label">{a.label}</h2>
                {a.isDefault && <Badge variant="bronze">Default</Badge>}
              </div>
              <p style={{ color: 'var(--ink-soft)' }}>{a.fullName}</p>
              <p>{a.address}</p>
              <p>
                {a.city}, {a.province} {a.postalCode}
              </p>
              <p>{a.phone}</p>
              <div className="address-card__actions">
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(a)}>
                  Edit
                </Button>
                {!a.isDefault && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Star}
                    disabled={busy}
                    onClick={() => run(() => setDefaultAddress(user.id, a.id), `${a.label} is now your default address.`)}
                  >
                    Set default
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  onClick={() => setConfirmDelete(a)}
                  aria-label={`Delete ${a.label} address`}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={MapPin} title="No saved addresses" message="Add an address to speed up checkout.">
          <Button icon={Plus} onClick={() => setEditing({ ...EMPTY, fullName: user.name ?? '' })}>
            Add address
          </Button>
        </EmptyState>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit address' : 'Add address'} size="md">
        {editing && <AddressForm initial={editing} onCancel={() => setEditing(null)} onSave={handleSave} saving={busy} />}
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Delete address?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={handleDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="muted">
          Remove <strong>{confirmDelete?.label}</strong> ({confirmDelete?.address})? This can&apos;t be undone.
        </p>
      </Modal>
    </>
  );
}
