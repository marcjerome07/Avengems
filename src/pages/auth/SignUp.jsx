import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, User, CircleAlert } from 'lucide-react';
import AuthShell, { FormAlert } from '../../components/auth/AuthShell';
import PasswordChecklist from '../../components/auth/PasswordChecklist';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useToast } from '../../context/useToast';
import { register } from '../../services/authService';
import { runValidators, validateName, validateEmail, validatePassword, validatePasswordMatch, PASSWORD_RULES } from '../../utils/validators';

export default function SignUp() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // Requirements show while the password is being created: when the field (or its
  // show/hide button) has focus, when a typed password still misses a rule, or after
  // a failed submit flagged the password.
  const passwordComplete = PASSWORD_RULES.every((rule) => rule.test(values.password));
  const showChecklist = passwordFocused || Boolean(errors.password) || (values.password !== '' && !passwordComplete);

  function handlePasswordBlur(e) {
    // Focus moving to the eye button inside the same group still counts as "in the field".
    if (!e.currentTarget.contains(e.relatedTarget)) setPasswordFocused(false);
  }

  function set(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }));
    setFormError('');
  }

  // Live mismatch feedback once the user has typed a confirmation.
  const confirmError = errors.confirm || (values.confirm && values.confirm !== values.password ? 'Passwords do not match.' : '');

  async function handleSubmit(e) {
    e.preventDefault();
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
        <div className="pw-field" onFocus={() => setPasswordFocused(true)} onBlur={handlePasswordBlur}>
          <Input
            label="Password"
            revealable
            autoComplete="new-password"
            value={values.password}
            onChange={(e) => set('password', e.target.value)}
            error={errors.password}
            aria-describedby={showChecklist ? 'pw-rules' : undefined}
          />
          <div className={`pw-reveal ${showChecklist ? 'is-open' : ''}`} aria-hidden={!showChecklist}>
            <div className="pw-reveal__inner">
              <PasswordChecklist password={values.password} id="pw-rules" />
            </div>
          </div>
        </div>
        <Input
          label="Confirm Password"
          revealable
          autoComplete="new-password"
          value={values.confirm}
          onChange={(e) => set('confirm', e.target.value)}
          error={confirmError}
        />
        <Button type="submit" size="lg" fullWidth loading={loading}>
          {loading ? 'Creating account…' : 'Create Account'}
        </Button>
        <p className="demo-box__text" style={{ textAlign: 'center' }}>
          Check your email to complete confirmation before signing in.
        </p>
      </form>
    </AuthShell>
  );
}
