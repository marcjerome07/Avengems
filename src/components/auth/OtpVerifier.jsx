import { useEffect, useState } from 'react';
import { FlaskConical, Clock, CircleAlert } from 'lucide-react';
import OtpInput from '../ui/OtpInput';
import Button from '../ui/Button';
import { FormAlert } from './AuthShell';
import { useToast } from '../../context/ToastContext';
import * as otpService from '../../services/otpService';
import useNow from '../../hooks/useNow';
import './Auth.css';

function mmss(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Six-digit code entry with expiry timer, resend cooldown, and the demo-mode code notice.
 * `verify(code)` must call the service and throw a ServiceError on failure.
 */
export default function OtpVerifier({ email, purpose, verify, onVerified, submitLabel = 'Verify' }) {
  const { showToast } = useToast();
  const [record, setRecord] = useState(() => otpService.getActiveOtp(email, purpose));
  const [code, setCode] = useState('');
  const [error, setError] = useState({ code: '', message: '' });
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const now = useNow(1000);

  // No active code (e.g. page refreshed after it was used): send a fresh one.
  useEffect(() => {
    if (record || !email) return;
    otpService
      .sendOtp(email, purpose)
      .then(setRecord)
      .catch((err) => {
        // A request may already be in flight (e.g. StrictMode double effects): reuse its code.
        const active = otpService.getActiveOtp(email, purpose);
        if (active) setRecord(active);
        else setError({ code: err.code, message: err.message });
      });
  }, [email, purpose, record]);

  const expiresIn = record ? record.expiresAt - now : 0;
  const resendIn = record ? record.resendAt - now : 0;
  const expired = Boolean(record) && expiresIn <= 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (code.length !== otpService.OTP_LENGTH) {
      setError({ code: 'INCOMPLETE', message: `Enter all ${otpService.OTP_LENGTH} digits of your code.` });
      return;
    }
    setVerifying(true);
    setError({ code: '', message: '' });
    try {
      const result = await verify(code);
      onVerified?.(result);
    } catch (err) {
      setError({ code: err.code ?? 'ERROR', message: err.message ?? 'Something went wrong. Please try again.' });
      if (err.code === 'INVALID') setCode('');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      const next = await otpService.sendOtp(email, purpose);
      setRecord(next);
      setCode('');
      setError({ code: '', message: '' });
      showToast('A new code has been sent.', { type: 'info' });
    } catch (err) {
      showToast(err.message, { type: 'error' });
    } finally {
      setResending(false);
    }
  }

  function handleExpireDemo() {
    otpService.expireOtpForDemo(email, purpose);
    setRecord(otpService.getActiveOtp(email, purpose));
  }

  return (
    <form className="otp-verifier" onSubmit={handleSubmit} noValidate>
      {record && (
        <div className="demo-notice" role="note">
          <FlaskConical size={18} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <p className="demo-notice__title">
              Demo mode: your code is <strong className="demo-notice__code">{record.demoCode}</strong>
            </p>
            <p className="demo-notice__text">
              No email is sent from this prototype. The code is also printed in the browser console.{' '}
              <button type="button" className="demo-notice__link" onClick={handleExpireDemo} disabled={expired}>
                Expire this code (demo)
              </button>
            </p>
          </div>
        </div>
      )}

      <OtpInput
        length={otpService.OTP_LENGTH}
        value={code}
        onChange={(v) => {
          setCode(v);
          if (error.message) setError({ code: '', message: '' });
        }}
        error={Boolean(error.message)}
        disabled={verifying}
      />

      <p className={`otp-timer ${expired ? 'is-expired' : ''}`} aria-live="polite">
        <Clock size={15} strokeWidth={1.5} aria-hidden="true" />
        {record ? (expired ? 'This code has expired.' : `Code expires in ${mmss(expiresIn)}`) : 'Sending your code…'}
      </p>

      {(error.message || expired) && (
        <FormAlert icon={CircleAlert}>
          {expired && !error.message ? 'This code has expired. Please request a new one.' : error.message}
        </FormAlert>
      )}

      <Button type="submit" size="lg" fullWidth loading={verifying} disabled={code.length !== otpService.OTP_LENGTH || expired}>
        {submitLabel}
      </Button>

      <p className="otp-resend">
        Didn&apos;t get a code?{' '}
        <button type="button" className="otp-resend__btn" onClick={handleResend} disabled={resending || resendIn > 0}>
          {resendIn > 0 ? `Resend OTP in ${Math.ceil(resendIn / 1000)}s` : resending ? 'Sending…' : 'Resend OTP'}
        </button>
      </p>
    </form>
  );
}
