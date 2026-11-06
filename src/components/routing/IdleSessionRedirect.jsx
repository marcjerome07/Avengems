import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';

/** Idle expiration redirects from public pages as well as private route guards. */
export default function IdleSessionRedirect() {
  const { idleExpired } = useAuth();
  const location = useLocation();
  return idleExpired && location.pathname !== '/login'
    ? <Navigate to="/login" replace state={{ from: location }} /> : null;
}
