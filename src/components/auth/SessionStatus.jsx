import EmptyState from '../ui/EmptyState';
import Button from '../ui/Button';

export default function SessionStatus({ error, onRetry, logoutFailed = false }) {
  if (!error) return <div className="route-loading" role="status" aria-label="Checking your session">Checking your session…</div>;
  return (
    <EmptyState title={logoutFailed ? 'Sign out needs another attempt' : 'Unable to verify your session'} message={error.message}>
      <Button onClick={() => { void onRetry().catch(() => {}); }}>Try again</Button>
      <Button to="/login" variant="outline">Log In</Button>
    </EmptyState>
  );
}
