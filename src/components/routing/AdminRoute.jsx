import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

function DeniedRedirect() {
  const { showToast } = useToast();
  useEffect(() => {
    showToast("You don't have access to that page.", { type: 'error' });
  }, [showToast]);
  return <Navigate to="/" replace />;
}

/**
 * Admin-only area. Logged-out visitors go to /login; non-admins go home with a toast.
 *
 * NOTE: Frontend route guards are for UX only. Real access control MUST be
 * enforced by the backend on every admin request.
 */
export default function AdminRoute({ children }) {
  const { isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!isAdmin) return <DeniedRedirect />;
  return children ?? <Outlet />;
}
