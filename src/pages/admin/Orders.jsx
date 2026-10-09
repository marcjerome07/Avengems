import { useMemo, useState } from 'react';
import { Search, PackageOpen } from 'lucide-react';
import AdminHeader from '../../components/admin/AdminHeader';
import Input from '../../components/ui/Input';
import EmptyState from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/Badge';
import { useToast } from '../../context/ToastContext';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getAllOrders, updateOrderStatus } from '../../services/adminService';
import { ORDER_STATUSES, PAYMENT_LABELS } from '../../services/orderService';
import { formatDate, formatPrice } from '../../utils/formatPrice';

export default function AdminOrders() {
  useDocumentTitle('Admin · Orders');
  const { showToast } = useToast();
  const { data, loading, setData } = useServiceData(() => getAllOrders());
  const [status, setStatus] = useState('All');
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState(null);

  const orders = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter(
      (o) =>
        (status === 'All' || o.status === status) && (!q || `${o.id} ${o.customer.name} ${o.customer.email}`.toLowerCase().includes(q)),
    );
  }, [orders, status, query]);

  async function changeStatus(order, next) {
    setSavingId(order.id);
    try {
      const updated = await updateOrderStatus(order.id, next);
      setData((list) => list.map((o) => (o.id === updated.id ? updated : o)));
      showToast(`${order.id} marked as ${next}.`, { type: 'success' });
    } catch (err) {
      showToast(err.message, { type: 'error' });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <AdminHeader title="Orders" subtitle="Review orders and update their status." />

      <div className="status-tabs" role="group" aria-label="Filter by status" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['All', ...ORDER_STATUSES].map((s) => (
          <button
            key={s}
            type="button"
            className={`pill ${status === s ? 'is-active' : ''}`}
            style={{ minHeight: 40, fontSize: 14 }}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
          >
            {s}{' '}
            <span style={{ opacity: 0.7, fontSize: 12 }}>
              {loading ? '' : s === 'All' ? orders.length : orders.filter((o) => o.status === s).length}
            </span>
          </button>
        ))}
      </div>

      <div className="admin-toolbar">
        <Input
          label="Search orders"
          icon={Search}
          placeholder="Order number, customer, email…"
          className="field--grow"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : rows.length ? (
        <div className="table-wrap">
          <table className="rtable">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Customer</th>
                <th scope="col">Date</th>
                <th scope="col">Payment</th>
                <th scope="col" className="num">
                  Total
                </th>
                <th scope="col">Status</th>
                <th scope="col">Update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td data-label="Order" className="strong">
                    {o.id}
                    <span className="cell-product__sub" style={{ display: 'block' }}>
                      {o.items.reduce((n, i) => n + i.quantity, 0)} pieces
                    </span>
                  </td>
                  <td data-label="Customer">
                    {o.customer.name}
                    <span className="cell-product__sub" style={{ display: 'block' }}>
                      {o.shipping.city}
                    </span>
                  </td>
                  <td data-label="Date">{formatDate(o.createdAt)}</td>
                  <td data-label="Payment">{PAYMENT_LABELS[o.paymentMethod]}</td>
                  <td data-label="Total" className="num strong">
                    {formatPrice(o.total)}
                  </td>
                  <td data-label="Status">
                    <StatusBadge status={o.status} />
                  </td>
                  <td data-label="Update">
                    <label className="visually-hidden" htmlFor={`st-${o.id}`}>
                      Change status for {o.id}
                    </label>
                    <select
                      id={`st-${o.id}`}
                      className="status-select"
                      value={o.status}
                      disabled={savingId === o.id}
                      onChange={(e) => changeStatus(o, e.target.value)}
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState compact icon={PackageOpen} title="No orders found" message="Try another status or search term." />
      )}
    </>
  );
}
