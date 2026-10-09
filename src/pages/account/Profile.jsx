import { useState } from 'react';
import { User, Mail, Phone } from 'lucide-react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { updateProfile } from '../../services/authService';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { runValidators, validateName, validatePhone, formatPhone } from '../../utils/validators';

export default function Profile() {
  useDocumentTitle('Profile');
  const { user, setUser } = useAuth();
  const { showToast } = useToast();
  const [values, setValues] = useState({ name: user.name ?? '', phone: user.phone ?? '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const dirty = values.name !== (user.name ?? '') || values.phone !== (user.phone ?? '');

  function set(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const result = runValidators(values, { name: validateName, phone: (v) => validatePhone(v, { required: false }) });
    setErrors(result);
    if (Object.keys(result).length) return;
    setSaving(true);
    try {
      const updated = await updateProfile(user.id, values);
      setUser(updated);
      showToast('Profile saved.', { type: 'success' });
    } catch (err) {
      showToast(err.message, { type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header>
        <h1 className="account-title">Profile</h1>
        <p className="account-subtitle">Keep your details up to date for faster checkout.</p>
      </header>
      <section className="panel">
        <form className="account-form" onSubmit={handleSubmit} noValidate>
          <Input
            label="Full Name"
            icon={User}
            autoComplete="name"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name}
          />
          <Input
            label="Email"
            icon={Mail}
            value={user.email}
            disabled
            hint="Email changes will be available once the backend is connected."
          />
          <Input
            label="Phone Number"
            icon={Phone}
            type="tel"
            optional
            placeholder="09XX XXX XXXX"
            autoComplete="tel"
            value={values.phone}
            onChange={(e) => set('phone', formatPhone(e.target.value))}
            error={errors.phone}
          />
          <div className="account-form__actions">
            <Button type="submit" loading={saving} disabled={!dirty}>
              Save changes
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => setValues({ name: user.name ?? '', phone: user.phone ?? '' })}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </section>
    </>
  );
}
