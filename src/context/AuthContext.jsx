import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { authSession } from '../services/authSession';
import { AuthContext } from './useAuth';
import { startSessionIdle } from '../services/sessionIdle';

export function AuthProvider({ children, session = authSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    const stopIdle = startSessionIdle({ session });
    void session.restore();
    const check = () => { if (document.visibilityState !== 'hidden') void session.restore(); };
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    const timer = window.setInterval(() => {
      if (session.getSnapshot().status === 'authenticated') check();
    }, 60000);
    return () => {
      stopIdle();
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [session]);
  const value = useMemo(() => ({
    user: state.user,
    loading: state.status === 'initializing',
    signingOut: state.status === 'signing-out',
    error: state.error,
    logoutFailed: state.status === 'logout-error',
    idleExpired: state.idleExpired === true,
    expiryUnconfirmed: state.expiryUnconfirmed === true,
    isAuthenticated: state.status === 'authenticated' && state.user?.verified === true,
    isAdmin: state.status === 'authenticated' && state.user?.verified === true && state.user.role === 'admin',
    login: session.login,
    logout: session.logout,
    retrySession: session.restore,
    // Profile updates reload the server identity instead of trusting browser data.
    setUser: session.restore,
  }), [state, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
