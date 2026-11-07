import { useState } from 'react';
import AdminHeader from '../../components/admin/AdminHeader';
import AdminDataState from '../../components/admin/AdminDataState';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import { useConfirm } from '../../context/useConfirm';
import { useToast } from '../../context/useToast';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getSettings, saveSettings } from '../../services/adminService';
import { runValidators, validateEmail, validateRequired } from '../../utils/validators';

function SettingsForm({ initial }) {
  const { showToast } = useToast();
  const confirm = useConfirm();
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
    const nonNegative = (label) => (v) => (/^\d{1,8}(\.\d{1,2})?$/.test(v) ? '' : `${label} must be finite, nonnegative money with at most two decimal places.`);
    const result = runValidators(values, {
      storeName: (v) => validateRequired(v, 'Store name'),
      contactEmail: validateEmail,
      shippingFee: nonNegative('Shipping fee'),
      freeShippingThreshold: nonNegative('Free shipping threshold'),
    });
    setErrors(result);
    if (Object.keys(result).length) return;
    const ok = await confirm({
      title: 'Save store settings?',
      message: 'Changes apply to all customers immediately.',
      confirmLabel: 'Save settings',
    });
    if (!ok) return;
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
      <p className="admin-note">Settings persist in the database and apply to new cart quotes and checkout calculations.</p>
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
  const { data, error, reload } = useServiceData(getSettings);
  return (
    <>
      <AdminHeader title="Settings" subtitle="Store details and shipping rules." />
      <section className="panel">{error ? <AdminDataState error={error} onRetry={reload} /> : data ? <SettingsForm initial={data} /> : <Skeleton height={320} />}</section>
    </>
  );
}
