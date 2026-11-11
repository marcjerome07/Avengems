import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useConfirm } from '../context/useConfirm';

/**
 * const ready = await requireLogin('add this piece to your bag')
 * Resolves true for signed-in shoppers. Guests get a Log in / Sign up prompt instead,
 * and come back to this page after logging in. Resolves false for guests.
 */
export default function useLoginPrompt() {
  const { isAuthenticated } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    async (action) => {
      if (isAuthenticated) return true;
      const choice = await confirm({
        title: 'Log in to continue',
        message: `Log in or create a free account to ${action}.`,
        confirmLabel: 'Log in',
        secondaryLabel: 'Sign up',
        cancelLabel: 'Not now',
      });
      if (choice === true) navigate('/login', { state: { from: location } });
      else if (choice === 'secondary') navigate('/signup', { state: { from: location } });
      return false;
    },
    [isAuthenticated, confirm, navigate, location],
  );
}
