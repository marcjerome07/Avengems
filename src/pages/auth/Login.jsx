import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, CircleAlert, MailWarning, FlaskConical } from 'lucide-react';
import AuthShell, { FormAlert } from '../../components/auth/AuthShell';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getDemoAccounts } from '../../services/authService';
import { runValidators, validateEmail, validateRequired } from '../../utils/validators';

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"
      />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

export default function Login() {
  const { login, isAuthenticated, isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = location.state?.from;
  const fromPath = from ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}` : null;

  const [values, setValues] = useState({
    email: location.state?.email ?? searchParams.get('email') ?? '',
    password: '',
    remember: true,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated && !loading) {
    return <Navigate to={fromPath ?? (isAdmin ? '/admin' : '/account')} replace />;
  }

  function set(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }));
    setFormError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const result = runValidators(values, {
      email: validateEmail,
      password: (v) => validateRequired(v, 'Password'),
    });
    setErrors(result);
    if (Object.keys(result).length) return;

    setLoading(true);
    setFormError(null);
    try {
      const user = await login(values.email.trim(), values.password, values.remember);
      showToast(`Welcome back, ${user.name.split(' ')[0]}.`, { type: 'success' });
      navigate(fromPath ?? (user.role === 'admin' ? '/admin' : '/account'), { replace: true });
    } catch (err) {
      setFormError({ code: err.code, message: err.message, email: err.email });
      setLoading(false);
    }
  }

  function fillDemo(account) {
    setValues((v) => ({ ...v, email: account.email, password: account.password }));
    setErrors({});
    setFormError(null);
  }

  const demoAside = (
    <aside className="demo-box" aria-labelledby="demo-title">
      <h2 id="demo-title" className="demo-box__title">
        <FlaskConical size={16} strokeWidth={1.6} aria-hidden="true" /> Demo accounts
      </h2>
      <p className="demo-box__text">For presentations. These accounts exist only in this prototype.</p>
      {getDemoAccounts().map((account) => (
        <div key={account.email} className="demo-account">
          <span className="demo-account__role">{account.role === 'admin' ? 'Admin' : 'Customer'}</span>
          <code>{account.email}</code>
          <code>{account.password}</code>
          <Button size="sm" variant="ghost" onClick={() => fillDemo(account)}>
            Use this account
          </Button>
        </div>
      ))}
    </aside>
  );

  return (
    <AuthShell
      title="Welcome Back"
      docTitle="Log in"
      subtitle="Log in to track orders, save favorites, and check out faster."
      aside={demoAside}
      footer={
        <p>
          Don&apos;t have an account? <Link to="/signup">Sign Up</Link>
        </p>
      }
    >
      {from && !formError && <FormAlert type="info">Please log in to continue.</FormAlert>}

      {formError?.code === 'UNVERIFIED' ? (
        <FormAlert type="warning" icon={MailWarning}>
          <p>{formError.message}</p>
          <Button size="sm" variant="outline" to={`/verify-email?email=${encodeURIComponent(formError.email)}`}>
            Verify my email
          </Button>
        </FormAlert>
      ) : (
        formError && <FormAlert icon={CircleAlert}>{formError.message}</FormAlert>
      )}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
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
          autoComplete="current-password"
          value={values.password}
          onChange={(e) => set('password', e.target.value)}
          error={errors.password}
        />
        <div className="auth-row">
          <label className="checkbox">
            <input type="checkbox" checked={values.remember} onChange={(e) => set('remember', e.target.checked)} />
            Remember me
          </label>
          <Link to="/forgot-password">Forgot Password?</Link>
        </div>
        <Button type="submit" size="lg" fullWidth loading={loading}>
          {loading ? 'Logging in…' : 'Log In'}
        </Button>
      </form>

      <div className="auth-divider">or</div>
      <button
        type="button"
        className="google-btn"
        onClick={() => showToast('Google sign-in will be available once the backend is connected.', { type: 'info' })}
      >
        <GoogleMark /> Continue with Google
      </button>
    </AuthShell>
  );
}
