import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import SessionStatus from '../auth/SessionStatus';

/**
 * Sends logged-out visitors to /login and brings them back afterwards.
 *
 * NOTE: Frontend route guards are for UX only. Real access control MUST be
 * enforced by the backend on every request.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, signingOut, error, logoutFailed, retrySession, logout } = useAuth();
  const location = useLocation();

  if (loading || signingOut || error) return <SessionStatus error={error} logoutFailed={logoutFailed} onRetry={logoutFailed ? logout : retrySession} />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children ?? <Outlet />;
}
