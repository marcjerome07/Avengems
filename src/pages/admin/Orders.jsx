import { useMemo, useRef, useState } from 'react';
import OrderReference from '../../components/account/OrderReference';
import { orderReference } from '../../utils/orderReference';
import { Search, PackageOpen } from 'lucide-react';
import AdminHeader from '../../components/admin/AdminHeader';
import AdminDataState from '../../components/admin/AdminDataState';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { MiniItems, TotalsList } from '../../components/cart/OrderSummary';
import Input from '../../components/ui/Input';
import EmptyState from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/Badge';
import { useToast } from '../../context/useToast';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getAllOrders, updateOrderStatus, cancelOrder, getAdminOrder, FULFILLMENT_NEXT } from '../../services/adminService';
import { ORDER_STATUSES, PAYMENT_LABELS } from '../../services/orderService';
import { formatDate, formatPrice } from '../../utils/formatPrice';

export default function AdminOrders() {
  useDocumentTitle('Admin · Orders');
  const { showToast } = useToast();
  const { data, loading, error, reload, setData } = useServiceData(() => getAllOrders());
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const detailRequest = useRef(0);
  const [detailId, setDetailId] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [status, setStatus] = useState('All');
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState(null);

  const orders = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter(
      (o) =>
        (status === 'All' || o.status === status) && (!q || `${orderReference(o)} ${o.id} ${o.customer.name} ${o.customer.email}`.toLowerCase().includes(q)),
    );
  }, [orders, status, query]);

  async function changeStatus(order, next) {
    setSavingId(order.id);
    try {
      const updated = await updateOrderStatus(order.id, next, order.status);
      setData((list) => list.map((o) => (o.id === updated.id ? updated : o)));
      showToast(`${orderReference(order)} marked as ${next}.`, { type: 'success' });
    } catch (err) {
      showToast(err.message, { type: 'error' });
      reload();
    } finally {
      setSavingId(null);
    }
  }

  async function viewOrder(id) {
    const request = ++detailRequest.current;
    setDetailId(id); setDetail(null); setDetailError(null);
    try { const order = await getAdminOrder(id); if (request === detailRequest.current) setDetail(order); }
    catch (err) { if (request === detailRequest.current) setDetailError(err); }
  }
  async function confirmCancellation() {
    const order = cancelling;
    setSavingId(order.id);
    try {
      const updated = await cancelOrder(order.id);
      setData((list) => list.map((value) => value.id === updated.id ? updated : value));
      setCancelling(null); showToast(`${orderReference(order)} cancelled and inventory restored.`, { type: 'success' });
    } catch (err) { showToast(err.message, { type: 'error' }); reload(); }
    finally { setSavingId(null); }
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

      {error ? <AdminDataState error={error} onRetry={reload} /> : loading ? (
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
                    <button type="button" className="text-link" onClick={() => viewOrder(o.id)}><OrderReference order={o} /></button>
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
                      Change status for {orderReference(o)}
                    </label>
                    <select
                      id={`st-${o.id}`}
                      className="status-select"
                      value={o.status}
                      disabled={Boolean(savingId) || !FULFILLMENT_NEXT[o.status]?.length}
                      onChange={(e) => changeStatus(o, e.target.value)}
                    >
                      {[o.status, ...(FULFILLMENT_NEXT[o.status] ?? [])].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    {['Pending', 'Processing'].includes(o.status) && <Button size="sm" variant="ghost" disabled={Boolean(savingId)} onClick={() => setCancelling(o)}>Cancel order</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState compact icon={PackageOpen} title="No orders found" message="No matching persisted orders. New checkout orders require the checkout SQL deployment." />
      )}
      <Modal open={Boolean(detailId)} onClose={() => { detailRequest.current++; setDetailId(null); setDetail(null); }} title={detail ? <OrderReference order={detail} /> : 'Order details'} size="lg">
        {detailError ? <AdminDataState error={detailError} onRetry={() => viewOrder(detailId)} /> : !detail && <p role="status">Loading order details…</p>}
        {detail && <><p>{detail.customer.name} · {detail.customer.email} · {detail.customer.phone}</p>
          <p>{detail.shipping.address}, {detail.shipping.city}, {detail.shipping.province} {detail.shipping.postalCode}</p>
          <p>{detail.status} · {PAYMENT_LABELS[detail.paymentMethod]} (demo payment)</p><MiniItems items={detail.items} /><TotalsList totals={detail} /></>}
      </Modal>
      <Modal open={Boolean(cancelling)} onClose={() => setCancelling(null)} title="Cancel and restock order?"
        footer={<><Button onClick={() => setCancelling(null)} disabled={Boolean(savingId)}>Keep order</Button><Button variant="danger" loading={Boolean(savingId)} onClick={confirmCancellation}>Cancel and restock</Button></>}>
        <p>Cancellation and inventory restoration must complete together. This action requires the approved atomic cancellation SQL function.</p>
      </Modal>
    </>
  );
}
