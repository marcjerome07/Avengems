import { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { FormAlert } from './AuthShell';
import { verifyEmail, resendVerification } from '../../services/authService';

/** Supabase owns codes, expiry and delivery. No local OTP records or demo codes. */
export default function RegistrationVerifier({ email, onVerified }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function verify(event) {
    event.preventDefault();
    if (!/^\d{6,10}$/.test(code)) { setError('Enter the confirmation code from your email.'); return; }
    setBusy(true);
    setError('');
    try { await verifyEmail(email, code); onVerified(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true);
    setError('');
    setNotice('');
    try { const result = await resendVerification(email); setNotice(result.message); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return (
    <form className="otp-verifier" onSubmit={verify} noValidate>
      <p>Follow the confirmation link in your email. If your email contains a code, enter it below.</p>
      <Input label="Verification code" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={10}
        onChange={(event) => { setCode(event.target.value.replace(/\D/g, '')); setError(''); }} disabled={busy} />
      {error && <FormAlert icon={CircleAlert}>{error}</FormAlert>}
      {notice && <FormAlert type="info">{notice}</FormAlert>}
      <Button type="submit" size="lg" fullWidth loading={busy} disabled={!/^\d{6,10}$/.test(code)}>Verify</Button>
      <p className="otp-resend">Didn&apos;t get an email?{' '}
        <button type="button" className="otp-resend__btn" onClick={resend} disabled={busy}>Resend confirmation</button>
      </p>
    </form>
  );
}
