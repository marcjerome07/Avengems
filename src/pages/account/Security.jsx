import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import PasswordChecklist from '../../components/auth/PasswordChecklist';
import { FormAlert } from '../../components/auth/AuthShell';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { changePassword } from '../../services/authService';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { validatePassword, validatePasswordMatch, validateRequired } from '../../utils/validators';

const EMPTY = { current: '', next: '', confirm: '' };

export default function Security() {
  useDocumentTitle('Security');
  const { user } = useAuth();
  const { showToast } = useToast();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function set(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }));
  }

  const confirmError = errors.confirm || (values.confirm && values.confirm !== values.next ? 'Passwords do not match.' : '');

  async function handleSubmit(e) {
    e.preventDefault();
    const result = {
      current: validateRequired(values.current, 'Current password'),
      next:
        validatePassword(values.next) ||
        (values.next && values.next === values.current ? 'Choose a password different from your current one.' : ''),
      confirm: validatePasswordMatch(values.next, values.confirm),
    };
    Object.keys(result).forEach((k) => !result[k] && delete result[k]);
    setErrors(result);
    if (Object.keys(result).length) return;
    setSaving(true);
    try {
      await changePassword(user.id, values.current, values.next);
      setValues(EMPTY);
      showToast('Password updated.', { type: 'success' });
    } catch (err) {
      if (err.code === 'INVALID_PASSWORD') setErrors({ current: err.message });
      else showToast(err.message, { type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header>
        <h1 className="account-title">Security</h1>
        <p className="account-subtitle">Change your password to keep your account safe.</p>
      </header>
      <section className="panel">
        <form className="account-form" onSubmit={handleSubmit} noValidate>
          <FormAlert type="info" icon={ShieldCheck}>
            Prototype: passwords are checked in this browser only. The backend will enforce this for real.
          </FormAlert>
          <Input
            label="Current Password"
            revealable
            autoComplete="current-password"
            value={values.current}
            onChange={(e) => set('current', e.target.value)}
            error={errors.current}
          />
          <Input
            label="New Password"
            revealable
            autoComplete="new-password"
            value={values.next}
            onChange={(e) => set('next', e.target.value)}
            error={errors.next}
            aria-describedby="sec-rules"
          />
          <PasswordChecklist password={values.next} id="sec-rules" />
          <Input
            label="Confirm New Password"
            revealable
            autoComplete="new-password"
            value={values.confirm}
            onChange={(e) => set('confirm', e.target.value)}
            error={confirmError}
          />
          <div className="account-form__actions">
            <Button type="submit" loading={saving}>
              Update password
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
