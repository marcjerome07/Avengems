import { useState } from 'react';
import AdminHeader from '../../components/admin/AdminHeader';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getSettings, saveSettings } from '../../services/adminService';
import { runValidators, validateEmail, validateRequired } from '../../utils/validators';

function SettingsForm({ initial }) {
  const { showToast } = useToast();
  const [values, setValues] = useState({
    storeName: initial.storeName,
    contactEmail: initial.contactEmail,
    shippingFee: String(initial.shippingFee),
    freeShippingThreshold: String(initial.freeShippingThreshold),
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const nonNegative = (label) => (v) => (v !== '' && Number(v) >= 0 ? '' : `${label} must be 0 or more.`);
    const result = runValidators(values, {
      storeName: (v) => validateRequired(v, 'Store name'),
      contactEmail: validateEmail,
      shippingFee: nonNegative('Shipping fee'),
      freeShippingThreshold: nonNegative('Free shipping threshold'),
    });
    setErrors(result);
    if (Object.keys(result).length) return;
    setSaving(true);
    try {
      await saveSettings({
        storeName: values.storeName.trim(),
        contactEmail: values.contactEmail.trim(),
        shippingFee: Number(values.shippingFee),
        freeShippingThreshold: Number(values.freeShippingThreshold),
      });
      showToast('Settings saved.', { type: 'success' });
    } catch (err) {
      showToast(err.message, { type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={handleSubmit} noValidate>
      <Input label="Store name" value={values.storeName} onChange={(e) => set('storeName', e.target.value)} error={errors.storeName} />
      <Input
        label="Contact email"
        type="email"
        value={values.contactEmail}
        onChange={(e) => set('contactEmail', e.target.value)}
        error={errors.contactEmail}
      />
      <div className="form-grid form-grid--2">
        <Input
          label="Shipping fee (₱)"
          type="number"
          min="0"
          value={values.shippingFee}
          onChange={(e) => set('shippingFee', e.target.value)}
          error={errors.shippingFee}
        />
        <Input
          label="Free shipping from (₱)"
          type="number"
          min="0"
          value={values.freeShippingThreshold}
          onChange={(e) => set('freeShippingThreshold', e.target.value)}
          error={errors.freeShippingThreshold}
        />
      </div>
      <p className="admin-note">Prototype: shipping changes apply to cart totals until the page is reloaded.</p>
      <div>
        <Button type="submit" loading={saving}>
          Save settings
        </Button>
      </div>
    </form>
  );
}

export default function Settings() {
  useDocumentTitle('Admin · Settings');
  const { data } = useServiceData(getSettings);
  return (
    <>
      <AdminHeader title="Settings" subtitle="Store details and shipping rules." />
      <section className="panel">{data ? <SettingsForm initial={data} /> : <Skeleton height={320} />}</section>
    </>
  );
}
