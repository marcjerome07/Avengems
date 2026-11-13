import { LayoutDashboard, ShieldAlert } from 'lucide-react';
import PageContainer from '../layout/PageContainer';
import EmptyState from '../ui/EmptyState';
import Button from '../ui/Button';
import { useAuth } from '../../context/useAuth';
import { ADMIN_SHOPPING_MESSAGE } from '../../utils/confirmMessages';

/**
 * Lets only customers through; admins see a short explanation instead.
 * UX only: the server already rejects orders from anyone who isn't a verified customer.
 */
export default function CustomerOnly({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return children;
  return (
    <PageContainer title="Admin account">
      <EmptyState icon={ShieldAlert} title="Admin accounts can’t place orders" message={ADMIN_SHOPPING_MESSAGE}>
        <Button to="/admin" icon={LayoutDashboard}>
          Go to Dashboard
        </Button>
      </EmptyState>
    </PageContainer>
  );
}
