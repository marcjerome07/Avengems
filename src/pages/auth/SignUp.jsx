import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Mail, User, CircleAlert } from 'lucide-react';
import AuthShell, { FormAlert } from '../../components/auth/AuthShell';
import PasswordChecklist, { PasswordMatch } from '../../components/auth/PasswordChecklist';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useToast } from '../../context/useToast';
import { useAuth } from '../../context/useAuth';
import { register } from '../../services/authService';
import { runValidators, validateName, validateEmail, validatePassword, validatePasswordMatch } from '../../utils/validators';
import { checkPassword } from '../../utils/passwordRules';

export default function SignUp() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [touched, setTouched] = useState({});
  const { isAuthenticated, isAdmin } = useAuth();

  // Already logged in: nothing to sign up for. Customers go Home, admins to their dashboard.
  if (isAuthenticated) return <Navigate to={isAdmin ? '/admin' : '/'} replace />;

  const nameRule = (v) => (v.length > 100 ? 'Use at most 100 characters for your name.' : validateName(v));
  const password = checkPassword(values.password, values.confirm);
  // Inline errors appear once a field has been visited; submit stays disabled until everything passes.
  const nameError = errors.name || (touched.name ? nameRule(values.name) : '');
  const emailError = errors.email || (touched.email ? validateEmail(values.email) : '');
  const passwordError = errors.password || (password.tooLong ? 'Use at most 128 characters for your password.' : '');
  const formValid = !nameRule(values.name) && !validateEmail(values.email) && password.valid && password.matches === true;

  // Requirements show while the password is being created: when the field (or its
  // show/hide button) has focus, when a typed password still misses a rule, or after
  // a failed submit flagged the password.
  const showChecklist = passwordFocused || Boolean(passwordError) || (values.password !== '' && !password.allMet);

  function handlePasswordBlur(e) {
    // Focus moving to the eye button inside the same group still counts as "in the field".
    if (!e.currentTarget.contains(e.relatedTarget)) setPasswordFocused(false);
  }

  function set(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }));
    setFormError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched({ name: true, email: true });
    const result = runValidators(values, {
      name: nameRule,
      email: validateEmail,
      password: (v) => (v.length > 128 ? 'Use at most 128 characters for your password.' : validatePassword(v)),
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
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          error={nameError}
        />
        <Input
          label="Email"
          type="email"
          icon={Mail}
          autoComplete="email"
          value={values.email}
          onChange={(e) => set('email', e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={emailError}
        />
        <div className="pw-field" onFocus={() => setPasswordFocused(true)} onBlur={handlePasswordBlur}>
          <Input
            label="Password"
            revealable
            autoComplete="new-password"
            value={values.password}
            onChange={(e) => set('password', e.target.value)}
            error={passwordError}
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
          error={errors.confirm && values.confirm ? '' : errors.confirm}
          aria-describedby={values.confirm ? 'pw-match' : undefined}
        />
        <PasswordMatch password={values.password} confirm={values.confirm} id="pw-match" />
        <Button type="submit" size="lg" fullWidth loading={loading} disabled={!formValid}
          aria-describedby={formValid ? undefined : 'signup-submit-hint'}>
          {loading ? 'Creating account…' : 'Create Account'}
        </Button>
        {!formValid && (
          <p className="auth-submit-hint" id="signup-submit-hint">
            Fill in every field and meet all password requirements to continue.
          </p>
        )}
        <p className="demo-box__text" style={{ textAlign: 'center' }}>
          Check your email to complete confirmation before signing in.
        </p>
      </form>
    </AuthShell>
  );
}
