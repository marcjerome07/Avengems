import { useState } from 'react';
import { PackageOpen } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import { TableSkeleton } from '../../components/ui/Skeleton';
import OrdersTable from '../../components/account/OrdersTable';
import { useAuth } from '../../context/useAuth';
import { getOrdersByUser, ORDER_STATUSES } from '../../services/orderService';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';

export default function Orders() {
  useDocumentTitle('My Orders');
  const { user } = useAuth();
  const [status, setStatus] = useState('All');
  const { data, loading, error, reload, setData } = useServiceData(() => getOrdersByUser(user.id), [user.id]);
  // A cancelled order updates in place, so it leaves the Pending tab and appears under Cancelled.
  const handleCancelled = (updated) => setData((list) => (list ?? []).map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
  const orders = data ?? [];
  const filtered = status === 'All' ? orders : orders.filter((o) => o.status === status);
  const countFor = (s) => (s === 'All' ? orders.length : orders.filter((o) => o.status === s).length);

  return (
    <>
      <header>
        <h1 className="account-title">My Orders</h1>
        <p className="account-subtitle">Track, review, and revisit every piece you&apos;ve ordered.</p>
      </header>

      <div className="status-tabs" role="group" aria-label="Filter orders by status">
        {['All', ...ORDER_STATUSES].map((s) => (
          <button
            key={s}
            type="button"
            className={`pill ${status === s ? 'is-active' : ''}`}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
          >
            {s} <span className="status-tabs__count">{loading ? '' : countFor(s)}</span>
          </button>
        ))}
      </div>

      {error ? <div role="alert"><p>{error.message}</p><Button onClick={reload}>Retry orders</Button></div> : loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : filtered.length ? (
        <OrdersTable orders={filtered} ownerId={user.id} onCancelled={handleCancelled} onRefresh={reload} />
      ) : (
        <EmptyState
          icon={PackageOpen}
          title={orders.length ? `No ${status.toLowerCase()} orders` : 'No orders yet'}
          message={orders.length ? 'Try a different status filter.' : 'Your orders will appear here once you check out.'}
        >
          {orders.length ? (
            <Button variant="outline" onClick={() => setStatus('All')}>
              Show all orders
            </Button>
          ) : (
            <Button to="/shop">Start shopping</Button>
          )}
        </EmptyState>
      )}
    </>
  );
}
