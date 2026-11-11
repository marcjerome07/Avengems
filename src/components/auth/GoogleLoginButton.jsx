import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { startGoogleLogin, cancelGoogleLogin } from '../../services/sessionService';
import { FormAlert } from './AuthShell';

const messages = {
  denied: 'Google sign-in was cancelled. You can try again or use email and password.',
  expired: 'Google sign-in expired. Please start again.',
  invalid: 'This Google sign-in link is invalid or has already been used. Please start again.',
  failed: 'Google sign-in could not be completed. Please try again or use email and password.',
};

export default function GoogleLoginButton({ remember = false, disabled = false, onPendingChange }) {
  const [params] = useSearchParams();
  const [error, setError] = useState(() => messages[params.get('oauth')] ?? '');
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    // Back from Google's account/consent page can restore this document from BFCache.
    const returned = async (event) => {
      if (!event.persisted || !pending.current) return;
      setError(messages.denied);
      // Finish cancellation before enabling another attempt, so its CSRF
      // bootstrap cannot accidentally cancel a newly initiated flow.
      try { await cancelGoogleLogin(); } catch { /* A new attempt also replaces an abandoned flow. */ }
      finally { pending.current = false; setLoading(false); onPendingChange?.(false); }
    };
    window.addEventListener('pageshow', returned);
    return () => window.removeEventListener('pageshow', returned);
  }, [onPendingChange]);
  async function start() {
    if (pending.current) return;
    pending.current = true; setLoading(true); onPendingChange?.(true); setError('');
    try { window.location.assign(await startGoogleLogin(remember)); }
    catch (err) {
      pending.current = false; setLoading(false); onPendingChange?.(false);
      setError(err.message || messages.failed);
    }
  }
  return <>
    {error && <FormAlert>{error}</FormAlert>}
    <button type="button" className="google-btn" disabled={disabled || loading} aria-busy={loading} onClick={start}>
      <GoogleMark />{loading ? 'Connecting to Google…' : 'Continue with Google'}
    </button>
    {loading && <p role="status">Opening Google sign-in. You can return here to cancel.</p>}
  </>;
}

function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" />
    <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
  </svg>;
}
