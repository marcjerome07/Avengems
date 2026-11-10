import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, User, CircleAlert } from 'lucide-react';
import AuthShell, { FormAlert } from '../../components/auth/AuthShell';
import PasswordChecklist from '../../components/auth/PasswordChecklist';
import GoogleLoginButton from '../../components/auth/GoogleLoginButton';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useToast } from '../../context/useToast';
import { register } from '../../services/authService';
import { runValidators, validateName, validateEmail, validatePassword, validatePasswordMatch } from '../../utils/validators';

export default function SignUp() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);
  const [googleLoading, setGoogleLoading] = useState(false);

  function set(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }));
    setFormError('');
  }

  // Live mismatch feedback once the user has typed a confirmation.
  const confirmError = errors.confirm || (values.confirm && values.confirm !== values.password ? 'Passwords do not match.' : '');

  async function handleSubmit(e) {
    e.preventDefault();
    if (googleLoading) return;
    const result = runValidators(values, {
      name: (v) => v.length > 100 ? 'Use at most 100 characters for your name.' : validateName(v),
      email: validateEmail,
      password: (v) => v.length > 128 ? 'Use at most 128 characters for your password.' : validatePassword(v),
      confirm: (v, all) => validatePasswordMatch(all.password, v),
    });
    setErrors(result);
    if (Object.keys(result).length) return;

    setLoading(true);
    try {
      const { email, message } = await register({ name: values.name, email: values.email, password: values.password });
      showToast(message, { type: 'info' });
      navigate(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setFormError(err.message ?? 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create Your Avengems Account"
      docTitle="Sign up"
      subtitle="Save your favorite stones, track orders, and check out faster."
      footer={
        <p>
          Already have an account? <Link to="/login">Log In</Link>
        </p>
      }
    >
      {formError && <FormAlert icon={CircleAlert}>{formError}</FormAlert>}
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
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
          type="email"
          icon={Mail}
          autoComplete="email"
          value={values.email}
          onChange={(e) => set('email', e.target.value)}
          error={errors.email}
        />
        <Input
          label="Password"
          revealable
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => set('password', e.target.value)}
          error={errors.password}
          aria-describedby="pw-rules"
        />
        <PasswordChecklist password={values.password} id="pw-rules" />
        <Input
          label="Confirm Password"
          revealable
          autoComplete="new-password"
          value={values.confirm}
          onChange={(e) => set('confirm', e.target.value)}
          error={confirmError}
        />
        <Button type="submit" size="lg" fullWidth loading={loading} disabled={googleLoading}>
          {loading ? 'Creating account…' : 'Create Account'}
        </Button>
        <p className="demo-box__text" style={{ textAlign: 'center' }}>
          Check your email to complete confirmation before signing in.
        </p>
      </form>
      <div className="auth-divider">or</div>
      <label className="checkbox">
        <input type="checkbox" checked={remember} disabled={googleLoading} onChange={(event) => setRemember(event.target.checked)} />
        Remember me for Google sign-in
      </label>
      <GoogleLoginButton remember={remember} disabled={loading} onPendingChange={setGoogleLoading} />
    </AuthShell>
  );
}
