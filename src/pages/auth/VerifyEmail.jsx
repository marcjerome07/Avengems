import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CircleCheck, MailQuestion } from 'lucide-react';
import AuthShell from '../../components/auth/AuthShell';
import OtpVerifier from '../../components/auth/OtpVerifier';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import PageContainer from '../../components/layout/PageContainer';
import { verifyEmail } from '../../services/authService';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);

  // After success, continue to login automatically.
  useEffect(() => {
    if (!verified) return undefined;
    const timer = setTimeout(() => navigate('/login', { state: { email } }), 3000);
    return () => clearTimeout(timer);
  }, [verified, navigate, email]);

  if (!email) {
    return (
      <PageContainer title="Verify Your Email">
        <EmptyState
          headingLevel={1}
          icon={MailQuestion}
          title="Which email should we verify?"
          message="Start from sign up or log in and we'll send you a verification code."
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
            Your email <span className="auth-email-pill">{email}</span> is verified. Taking you to log in…
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
          We sent a verification code to your email: <span className="auth-email-pill">{email}</span>
        </>
      }
      footer={
        <p>
          Wrong email? <Link to="/signup">Create your account again</Link>
        </p>
      }
    >
      <OtpVerifier
        email={email}
        purpose="verify"
        verify={(code) => verifyEmail(email, code)}
        onVerified={() => setVerified(true)}
        submitLabel="Verify"
      />
    </AuthShell>
  );
}
