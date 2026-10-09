import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, CircleAlert, CircleCheck, ArrowLeft } from 'lucide-react';
import AuthShell, { FormAlert } from '../../components/auth/AuthShell';
import OtpVerifier from '../../components/auth/OtpVerifier';
import PasswordChecklist from '../../components/auth/PasswordChecklist';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { requestPasswordReset, resetPassword } from '../../services/authService';
import { verifyOtp } from '../../services/otpService';
import { validateEmail, validatePassword, validatePasswordMatch } from '../../utils/validators';

const backToLogin = (
  <p>
    Remembered it? <Link to="/login">Back to Log In</Link>
  </p>
);

function EmailStep({ onSent }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const message = validateEmail(email);
    setError(message);
    if (message) return;
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      onSent(email.trim().toLowerCase());
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Forgot your password?"
      docTitle="Forgot password"
      subtitle="Enter the email you registered with and we'll send you a verification code."
      footer={backToLogin}
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Input
          label="Registered email"
          type="email"
          icon={Mail}
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError('');
          }}
          error={error}
        />
        <Button type="submit" size="lg" fullWidth loading={loading}>
          Send OTP
        </Button>
      </form>
    </AuthShell>
  );
}

function ResetStep({ email, token, onDone, onRestart }) {
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: '' }));
  }

  const confirmError = errors.confirm || (values.confirm && values.confirm !== values.password ? 'Passwords do not match.' : '');

  async function handleSubmit(e) {
    e.preventDefault();
    const next = {
      password: validatePassword(values.password),
      confirm: validatePasswordMatch(values.password, values.confirm),
    };
    setErrors(next);
    if (next.password || next.confirm) return;
    setLoading(true);
    try {
      await resetPassword(email, token, values.password);
      onDone();
    } catch (err) {
      setFormError(err.message);
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Create New Password" docTitle="New password" subtitle="Choose a strong password you haven't used before.">
      {formError && (
        <FormAlert icon={CircleAlert}>
          <p>{formError}</p>
          <Button size="sm" variant="outline" onClick={onRestart}>
            Start again
          </Button>
        </FormAlert>
      )}
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Input
          label="New Password"
          revealable
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => set('password', e.target.value)}
          error={errors.password}
          aria-describedby="reset-rules"
        />
        <PasswordChecklist password={values.password} id="reset-rules" />
        <Input
          label="Confirm New Password"
          revealable
          autoComplete="new-password"
          value={values.confirm}
          onChange={(e) => set('confirm', e.target.value)}
          error={confirmError}
        />
        <Button type="submit" size="lg" fullWidth loading={loading}>
          Reset Password
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ForgotPassword() {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');

  function restart() {
    setStep('email');
    setToken('');
  }

  if (step === 'email') {
    return (
      <EmailStep
        onSent={(e) => {
          setEmail(e);
          setStep('otp');
        }}
      />
    );
  }

  if (step === 'otp') {
    return (
      <AuthShell
        title="Enter Verification Code"
        docTitle="Verification code"
        subtitle={
          <>
            We sent a 6-digit code to <span className="auth-email-pill">{email}</span>
          </>
        }
        footer={
          <button type="button" className="auth-link" onClick={restart}>
            <ArrowLeft size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Use a different email
          </button>
        }
      >
        <OtpVerifier
          email={email}
          purpose="reset"
          verify={(code) => verifyOtp(email, 'reset', code)}
          onVerified={(result) => {
            setToken(result.token);
            setStep('reset');
          }}
          submitLabel="Verify Code"
        />
      </AuthShell>
    );
  }

  if (step === 'reset') {
    return <ResetStep email={email} token={token} onDone={() => setStep('done')} onRestart={restart} />;
  }

  return (
    <AuthShell title="Password successfully changed." docTitle="Password changed">
      <div className="auth-success" role="status">
        <span className="auth-success__icon">
          <CircleCheck size={36} strokeWidth={1.3} aria-hidden="true" />
        </span>
        <p>You can now log in with your new password.</p>
        <Button to="/login" state={{ email }} size="lg" fullWidth>
          Return to Login
        </Button>
      </div>
    </AuthShell>
  );
}
