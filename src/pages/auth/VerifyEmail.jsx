import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CircleCheck, MailQuestion } from 'lucide-react';
import AuthShell, { FormAlert } from '../../components/auth/AuthShell';
import RegistrationVerifier from '../../components/auth/RegistrationVerifier';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import PageContainer from '../../components/layout/PageContainer';
import { verifyEmailCallback } from '../../services/authService';
import { hasConfirmationLink, readConfirmationLink } from '../../utils/confirmationLink';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);
  const [confirming, setConfirming] = useState(() => typeof window !== 'undefined' && hasConfirmationLink(window.location));
  const [linkError, setLinkError] = useState('');
  const callback = useRef(null);

  useEffect(() => {
    let active = true;
    if (!callback.current) {
      const link = readConfirmationLink(window.location, window.history);
      if (!link) return undefined;
      // Reuse the promise under StrictMode; a provider proof must not be consumed twice.
      callback.current = link.error ? Promise.reject(new Error(link.error)) : verifyEmailCallback(link.proof);
    }
    callback.current.then(() => {
      if (active) { setVerified(true); setConfirming(false); }
    }).catch((error) => {
      if (active) { setLinkError(error.message); setConfirming(false); }
    });
    return () => { active = false; };
  }, []);

  // After success, continue to login automatically.
  useEffect(() => {
    if (!verified) return undefined;
    const timer = setTimeout(() => navigate('/login', { state: { email } }), 3000);
    return () => clearTimeout(timer);
  }, [verified, navigate, email]);

  if (confirming) {
    return <AuthShell title="Confirming your email" docTitle="Confirm email"><p role="status">Checking your confirmation…</p></AuthShell>;
  }

  if (!email && !verified) {
    return (
      <PageContainer title="Verify Your Email">
        <EmptyState
          headingLevel={1}
          icon={MailQuestion}
          title="Which email should we verify?"
          message={linkError || 'Start from sign up to request a confirmation email.'}
        >
          <Button to="/signup">Sign Up</Button>
          <Button to="/login" variant="outline">
            Log In
          </Button>
        </EmptyState>
      </PageContainer>
    );
  }

  if (verified) {
    return (
      <AuthShell title="Email verified" docTitle="Email verified">
        <div className="auth-success" role="status">
          <span className="auth-success__icon">
            <CircleCheck size={36} strokeWidth={1.3} aria-hidden="true" />
          </span>
          <p>
            {email ? <>Your email <span className="auth-email-pill">{email}</span> is verified.</> : 'Your email is verified.'} Taking you to log in…
          </p>
          <Button to="/login" state={{ email }} size="lg" fullWidth>
            Continue to Log In
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Verify Your Email"
      subtitle={
        <>
          Check confirmation instructions for <span className="auth-email-pill">{email}</span>. If already confirmed, continue to log in.
        </>
      }
      footer={
        <p>
          <Link to="/login" state={{ email }}>Continue to Log In</Link> · Wrong email? <Link to="/signup">Sign up again</Link>
        </p>
      }
    >
      {linkError && <FormAlert>{linkError}</FormAlert>}
      <RegistrationVerifier
        email={email}
        onVerified={() => setVerified(true)}
      />
    </AuthShell>
  );
}
