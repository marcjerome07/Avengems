import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, CircleAlert, MailWarning } from 'lucide-react';
import AuthShell, { FormAlert } from '../../components/auth/AuthShell';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { runValidators, validateEmail, validateRequired } from '../../utils/validators';

export default function Login() {
  const { login, logout, isAuthenticated, isAdmin, loading: initializing, signingOut, error: sessionError, logoutFailed, retrySession, idleExpired, expiryUnconfirmed } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // Set by ProtectedRoute/AdminRoute when a logged-out visitor opened a protected page:
  // send them back there after login. Only internal paths ("/x", never "//x" or "/\x",
  // which browsers treat as another site) are accepted.
  const from = location.state?.from;
  const fromPath = from?.pathname?.startsWith('/') && !from.pathname.startsWith('//') && !from.pathname.startsWith('/\\')
    ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}` : null;
  // Where to go when there is no page to return to: customers to Home, admins to their dashboard.
  const landing = (admin) => fromPath ?? (admin ? '/admin' : '/');

  const [values, setValues] = useState({
    email: location.state?.email ?? searchParams.get('email') ?? '',
    password: '',
    remember: true,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (initializing || signingOut) {
    return <AuthShell title="Welcome Back" docTitle="Log in"><p role="status">Checking your session…</p></AuthShell>;
  }
  if (isAuthenticated && !sessionError && !loading) {
    return <Navigate to={landing(isAdmin)} replace />;
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
      navigate(landing(user.role === 'admin'), { replace: true });
    } catch (err) {
      setFormError({ code: err.code, message: err.message, email: err.email });
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome Back"
      docTitle="Log in"
      subtitle="Log in to track orders, save favorites, and check out faster."
      footer={
        <p>
          Don&apos;t have an account? <Link to="/signup">Sign Up</Link>
        </p>
      }
    >
      {sessionError && !formError && <FormAlert icon={CircleAlert}>
        <p>{sessionError.message}</p>
        <Button size="sm" variant="outline" onClick={() => {
          void (logoutFailed ? logout() : retrySession()).catch((error) => setFormError({ code: error.code, message: error.message }));
        }}>{logoutFailed ? 'Retry sign out' : 'Retry session check'}</Button>
      </FormAlert>}
      {idleExpired && <FormAlert type="info"><p>Your application session expired. Please log in again. Sessions have a 20-minute inactivity limit and an absolute time limit.</p>
        {expiryUnconfirmed && <p>The server could not be reached to confirm expiration. This page is locked locally; server access still requires a valid, unexpired session.</p>}</FormAlert>}
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
    </AuthShell>
  );
}
