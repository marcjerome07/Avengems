import { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { FormAlert } from './AuthShell';
import * as otpService from '../../services/otpService';
import useNow from '../../hooks/useNow';
import './Auth.css';

/** Delivery and code validity are server-owned; the UI timer only limits resends. */
export default function OtpVerifier({ email, purpose = 'reset', verify, onVerified, submitLabel = 'Verify', initialResendAt = 0 }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(initialResendAt);
  const now = useNow(1000);
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!/^\d{6,10}$/.test(code)) { setError('Enter the recovery code from your email.'); return; }
    setBusy(true);
    setError('');
    try { const result = await verify(code); onVerified?.(result); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await otpService.sendOtp(email, purpose);
      setNotice(result.message);
      setResendAt(Date.now() + (result.retryAfter || 60) * 1000);
      setCode('');
    } catch (failure) {
      setError(failure.message);
      if (failure.retryAfter) setResendAt(Date.now() + failure.retryAfter * 1000);
    } finally { setBusy(false); }
  }
  return (
    <form className="otp-verifier" onSubmit={handleSubmit} noValidate>
      <Input label="Recovery code" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={10}
        disabled={busy} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '')); setError(''); }} />
      {error && <FormAlert icon={CircleAlert}>{error}</FormAlert>}
      {notice && <FormAlert type="info">{notice}</FormAlert>}
      <Button type="submit" size="lg" fullWidth loading={busy} disabled={!/^\d{6,10}$/.test(code)}>{submitLabel}</Button>
      <p className="otp-resend">Didn&apos;t get a code?{' '}
        <button type="button" className="otp-resend__btn" onClick={resend} disabled={busy || seconds > 0}>
          {seconds > 0 ? `Resend OTP in ${seconds}s` : 'Resend OTP'}
        </button>
      </p>
    </form>
  );
}
