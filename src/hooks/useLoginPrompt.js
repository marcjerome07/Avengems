import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useConfirm } from '../context/useConfirm';
import { ADMIN_SHOPPING_MESSAGE } from '../utils/confirmMessages';

/**
 * const ready = await requireLogin('add this piece to your bag')
 * Resolves true for signed-in customers. Guests get a Log in / Sign up prompt instead,
 * and come back to this page after logging in. Admins are told they can't shop
 * (the server rejects their orders anyway). Resolves false for guests and admins.
 */
export default function useLoginPrompt() {
  const { isAuthenticated, isAdmin } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    async (action) => {
      if (isAdmin) {
        const toDashboard = await confirm({
          title: 'Admin accounts can’t place orders',
          message: ADMIN_SHOPPING_MESSAGE,
          confirmLabel: 'Go to Dashboard',
          cancelLabel: 'Keep browsing',
        });
        if (toDashboard === true) navigate('/admin');
        return false;
      }
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
    [isAuthenticated, isAdmin, confirm, navigate, location],
  );
}
