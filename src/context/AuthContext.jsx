import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { authSession } from '../services/authSession';
import { AuthContext } from './useAuth';

export function AuthProvider({ children, session = authSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    void session.restore();
    const check = () => { if (document.visibilityState !== 'hidden') void session.restore(); };
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    const timer = window.setInterval(() => {
      if (session.getSnapshot().status === 'authenticated') check();
    }, 60000);
    return () => {
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
    isAuthenticated: state.status === 'authenticated' && state.user?.verified === true,
    isAdmin: state.status === 'authenticated' && state.user?.verified === true && state.user.role === 'admin',
    login: session.login,
    logout: session.logout,
    retrySession: session.restore,
    // The prototype profile screen can only request a server reload, never set identity.
    setUser: session.restore,
  }), [state, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
