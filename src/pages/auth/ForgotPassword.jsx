import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, CircleAlert, CircleCheck, ArrowLeft } from 'lucide-react';
import AuthShell, { FormAlert } from '../../components/auth/AuthShell';
import OtpVerifier from '../../components/auth/OtpVerifier';
import PasswordChecklist, { PasswordMatch } from '../../components/auth/PasswordChecklist';
import { checkPassword } from '../../utils/passwordRules';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { requestPasswordReset, resetPassword } from '../../services/authService';
import { verifyOtp } from '../../services/otpService';
import { validateEmail, validatePassword, validatePasswordMatch } from '../../utils/validators';
import { useAuth } from '../../context/useAuth';

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
      const result = await requestPasswordReset(email.trim());
      onSent(email.trim().toLowerCase(), result.retryAfter);
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

function ResetStep({ onDone, onRestart }) {
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: '' }));
  }

  const check = checkPassword(values.password, values.confirm);
  const passwordError = errors.password || (check.tooLong ? 'Use at most 128 characters.' : '');
  const formValid = check.valid && check.matches === true;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formValid) return;
    const next = {
      password: values.password.length > 128 ? 'Use at most 128 characters.' : validatePassword(values.password),
      confirm: validatePasswordMatch(values.password, values.confirm),
    };
    setErrors(next);
    if (next.password || next.confirm) return;
    setLoading(true);
    try {
      const result = await resetPassword(values.password);
      onDone(result);
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
          error={passwordError}
          aria-describedby="reset-rules"
        />
        <PasswordChecklist password={values.password} id="reset-rules" />
        <Input
          label="Confirm New Password"
          revealable
          autoComplete="new-password"
          value={values.confirm}
          onChange={(e) => set('confirm', e.target.value)}
          error={values.confirm ? '' : errors.confirm}
          aria-describedby={values.confirm ? 'reset-match' : undefined}
        />
        <PasswordMatch password={values.password} confirm={values.confirm} id="reset-match" />
        <Button type="submit" size="lg" fullWidth loading={loading} disabled={!formValid}
          aria-describedby={formValid ? undefined : 'reset-submit-hint'}>
          Reset Password
        </Button>
        {!formValid && (
          <p className="auth-submit-hint" id="reset-submit-hint">
            Meet all password requirements and confirm your password to continue.
          </p>
        )}
      </form>
    </AuthShell>
  );
}

export default function ForgotPassword() {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [revocationConfirmed, setRevocationConfirmed] = useState(true);
  const { logout } = useAuth();

  function restart() {
    setStep('email');
  }

  if (step === 'email') {
    return (
      <EmailStep
        onSent={(e, retryAfter) => {
          setEmail(e);
          setResendAt(Date.now() + (retryAfter || 60) * 1000);
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
            If an account exists, check the recovery email for <span className="auth-email-pill">{email}</span>.
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
          initialResendAt={resendAt}
          verify={(code) => verifyOtp(email, 'reset', code)}
          onVerified={() => {
            setStep('reset');
          }}
          submitLabel="Verify Code"
        />
      </AuthShell>
    );
  }

  if (step === 'reset') {
    return <ResetStep onDone={(result) => {
      setRevocationConfirmed(result.sessionRevocationConfirmed === true);
      // Invalidate pending frontend restorations immediately. The backend already
      // cleared the app cookies; its logout endpoint treats the missing session safely.
      void logout().catch(() => {});
      setStep('done');
    }} onRestart={restart} />;
  }

  return (
    <AuthShell title="Password successfully changed." docTitle="Password changed">
      <div className="auth-success" role="status">
        <span className="auth-success__icon">
          <CircleCheck size={36} strokeWidth={1.3} aria-hidden="true" />
        </span>
        <p>You can now log in with your new password.</p>
        {!revocationConfirmed && <FormAlert type="warning">Your password was changed, but signing out other devices could not be confirmed. Sign in again and review your sessions.</FormAlert>}
        <Button to="/login" state={{ email }} size="lg" fullWidth>
          Return to Login
        </Button>
      </div>
    </AuthShell>
  );
}
