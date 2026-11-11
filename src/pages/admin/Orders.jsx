import { useMemo, useRef, useState } from 'react';
import OrderReference from '../../components/account/OrderReference';
import { PaymentStatus } from '../../components/account/PaymentStatus';
import { orderReference } from '../../utils/orderReference';
import { PackageOpen } from 'lucide-react';
import AdminHeader from '../../components/admin/AdminHeader';
import AdminDataState from '../../components/admin/AdminDataState';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { MiniItems, TotalsList } from '../../components/cart/OrderSummary';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import OrderNotifications from '../../components/admin/OrderNotifications';
import EmptyState from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/Badge';
import { useConfirm } from '../../context/useConfirm';
import { useToast } from '../../context/useToast';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getAllOrders, updateOrderStatus, cancelOrder, getAdminOrder, FULFILLMENT_NEXT, reconcileAdminPayment, closeAdminPayment, ORDER_CARRIERS } from '../../services/adminService';
import { PAYMENT_LABELS } from '../../services/orderService';
import useOrderTableQuery, { ariaSort } from '../../hooks/useOrderTableQuery';
import { OrderFilters, OrderPagination, SortHeader } from '../../components/admin/OrderTableControls';
import { formatDate, formatPrice } from '../../utils/formatPrice';

export default function AdminOrders() {
  useDocumentTitle('Admin · Orders');
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload, setData } = useServiceData(() => getAllOrders());
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const detailRequest = useRef(0);
  const [detailId, setDetailId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [providerSessionId, setProviderSessionId] = useState('');
  const [cancelling, setCancelling] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [shipping, setShipping] = useState(null); // order being marked as Shipped
  const [carrier, setCarrier] = useState(ORDER_CARRIERS[0]);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingError, setTrackingError] = useState('');
  async function verifyPayment(close = false) {
    if (!detail || savingId) return;
    setSavingId(detail.id);
    try {
      if (close) await closeAdminPayment(detail.id);
      else await reconcileAdminPayment(detail.id, providerSessionId.trim());
      const updated = await getAdminOrder(detail.id);
      setDetail(updated); setData((list) => list.map((order) => order.id === updated.id ? updated : order));
      showToast('Payment state verified.', { type: 'info' });
    } catch (err) { showToast(err.message, { type: 'error' }); }
    finally { setSavingId(null); }
  }

  const orders = useMemo(() => data ?? [], [data]);
  const table = useOrderTableQuery(orders);
  const rows = table.rows;

  async function requestStatus(order, next) {
    if (next === 'Shipped') {
      // The shipping dialog doubles as the confirmation and collects tracking details.
      setShipping(order); setCarrier(ORDER_CARRIERS[0]); setTrackingNumber(''); setTrackingError('');
      return;
    }
    // The select is controlled by order.status, so it stays on the old value if this is cancelled.
    const ok = await confirm({ title: 'Update order status?', message: `Mark ${orderReference(order)} as ${next}?`, confirmLabel: `Mark as ${next}` });
    if (ok) await changeStatus(order, next);
  }
  async function confirmShipped() {
    const number = trackingNumber.trim();
    if (number && !/^[A-Za-z0-9][A-Za-z0-9 -]{2,48}[A-Za-z0-9]$/.test(number)) {
      setTrackingError('Use 4–50 letters, numbers, spaces or dashes.');
      return;
    }
    const ok = await changeStatus(shipping, 'Shipped', number ? { trackingNumber: number, trackingCarrier: carrier } : undefined);
    if (ok) setShipping(null);
  }
  async function changeStatus(order, next, tracking) {
    setSavingId(order.id);
    try {
      const updated = await updateOrderStatus(order.id, next, order.status, tracking);
      setData((list) => list.map((o) => (o.id === updated.id ? updated : o)));
      showToast(`${orderReference(order)} marked as ${next}. The customer will be emailed.`, { type: 'success' });
      return true;
    } catch (err) {
      showToast(err.message, { type: 'error' });
      reload();
      return false;
    } finally {
      setSavingId(null);
    }
  }

  async function viewOrder(id) {
    const request = ++detailRequest.current;
    setDetailId(id); setDetail(null); setDetailError(null); setProviderSessionId('');
    try { const order = await getAdminOrder(id); if (request === detailRequest.current) setDetail(order); }
    catch (err) { if (request === detailRequest.current) setDetailError(err); }
  }
  async function confirmCancellation() {
    const order = cancelling;
    setSavingId(order.id);
    try {
      const updated = await cancelOrder(order.id, cancelReason);
      setData((list) => list.map((value) => value.id === updated.id ? updated : value));
      setCancelling(null); showToast(`Order ${orderReference(order)} was cancelled. Its items are back in stock.`, { type: 'success' });
    } catch (err) { showToast(err.message, { type: 'error' }); reload(); }
    finally { setSavingId(null); }
  }

  return (
    <>
      <AdminHeader title="Orders" subtitle="Review orders and update their status." />

      <OrderFilters query={table} loading={loading} />

      {error ? <AdminDataState error={error} onRetry={reload} /> : loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : rows.length ? (
        <>
        <div className="table-wrap">
          <table className="rtable">
            <thead>
              <tr>
                <th scope="col" aria-sort={ariaSort(table, 'ref')}><SortHeader label="Order #" sortKey="ref" query={table} /></th>
                <th scope="col">Customer</th>
                <th scope="col" aria-sort={ariaSort(table, 'date')}><SortHeader label="Date" sortKey="date" query={table} /></th>
                <th scope="col">Payment</th>
                <th scope="col" className="num" aria-sort={ariaSort(table, 'total')}>
                  <SortHeader label="Total" sortKey="total" query={table} align="end" />
                </th>
                <th scope="col" aria-sort={ariaSort(table, 'status')}><SortHeader label="Status" sortKey="status" query={table} /></th>
                <th scope="col">Update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td data-label="Order" className="strong">
                    <button type="button" className="text-link" onClick={() => viewOrder(o.id)}><OrderReference order={o} /></button>
                    <span className="cell-product__sub" style={{ display: 'block' }}>
                      {(() => {
                        const pieces = o.items.reduce((n, i) => n + i.quantity, 0);
                        return `${pieces} ${pieces === 1 ? 'piece' : 'pieces'}`;
                      })()}
                    </span>
                  </td>
                  <td data-label="Customer">
                    {o.customer.name}
                    <span className="cell-product__sub" style={{ display: 'block' }}>
                      {o.shipping.city}
                    </span>
                  </td>
                  <td data-label="Date">{formatDate(o.createdAt)}</td>
                  <td data-label="Payment">{PAYMENT_LABELS[o.paymentMethod]}<div><PaymentStatus order={o} /></div></td>
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
                      disabled={Boolean(savingId) || !FULFILLMENT_NEXT[o.status]?.length || (o.paymentMethod !== 'cod' && o.payment?.status !== 'paid')}
                      onChange={(e) => requestStatus(o, e.target.value)}
                    >
                      {[o.status, ...(FULFILLMENT_NEXT[o.status] ?? [])].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    {['Pending', 'Processing'].includes(o.status) && !o.payment && <Button size="sm" variant="ghost" disabled={Boolean(savingId)} onClick={() => { setCancelReason(''); setCancelling(o); }}>Cancel order</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <OrderPagination query={table} />
        </>
      ) : orders.length ? (
        <EmptyState compact icon={PackageOpen} title="No orders match these filters" message="Try a different status, payment method, date range or search.">
          <Button variant="outline" onClick={table.clearFilters}>Clear filters</Button>
        </EmptyState>
      ) : (
        <EmptyState compact icon={PackageOpen} title="No orders yet" message="Orders appear here as soon as customers check out." />
      )}
      <Modal open={Boolean(detailId)} onClose={() => { detailRequest.current++; setDetailId(null); setDetail(null); }} title={detail ? <OrderReference order={detail} /> : 'Order details'} size="lg">
        {detailError ? <AdminDataState error={detailError} onRetry={() => viewOrder(detailId)} /> : !detail && <p role="status">Loading order details…</p>}
        {detail && <><p>{detail.customer.name} · {detail.customer.email} · {detail.customer.phone}</p>
          <p>{detail.shipping.address}, {detail.shipping.city}, {detail.shipping.province} {detail.shipping.postalCode}</p>
          <p>{detail.status} · {PAYMENT_LABELS[detail.paymentMethod]} · <PaymentStatus order={detail} /></p>
          {detail.tracking && <p>Tracking: {detail.tracking.carrier ?? 'Courier'} {detail.tracking.number}
            {detail.tracking.url && <> · <a className="text-link" href={detail.tracking.url} target="_blank" rel="noreferrer">Track</a></>}</p>}
          {detail.cancellationReason && <p>Cancellation reason: {detail.cancellationReason}</p>}
          {detail.payment && <section aria-label="Test payment management">
            {['creating','unknown'].includes(detail.payment.status) && <Input label="Test provider session ID for reconciliation" value={providerSessionId} onChange={(event) => setProviderSessionId(event.target.value)} />}
            <Button disabled={Boolean(savingId)} onClick={() => verifyPayment()}>Reconcile payment and refunds</Button>
            {['created','pending'].includes(detail.payment.status) && <Button variant="outline" disabled={Boolean(savingId)} onClick={() => verifyPayment(true)}>Close test payment</Button>}
            <p>Paid cancellations and refunds require separate review. Refund reconciliation never restores stock.</p>
          </section>}
          <MiniItems items={detail.items} /><TotalsList totals={detail} />
          <OrderNotifications key={`${detail.id}-${detail.status}`} orderId={detail.id} onMessage={(message, type) => showToast(message, { type })} /></>}
      </Modal>
      <Modal open={Boolean(cancelling)} onClose={() => setCancelling(null)} title="Cancel this order?"
        footer={<><Button variant="ghost" onClick={() => setCancelling(null)} disabled={Boolean(savingId)}>Keep order</Button><Button variant="danger" loading={Boolean(savingId)} onClick={confirmCancellation}>Cancel order</Button></>}>
        <p className="muted">
          Order <strong>{cancelling && orderReference(cancelling)}</strong> will be cancelled and its items returned to stock.
          The customer will be notified. This can’t be undone.
        </p>
        <div className="field" style={{ marginTop: 16 }}>
          <label className="field__label" htmlFor="cancel-reason">
            Reason for cancellation <span className="field__optional">(optional)</span>
          </label>
          <textarea id="cancel-reason" className="field__input" rows={3} maxLength={500} value={cancelReason}
            placeholder="e.g. Item out of stock, customer request"
            onChange={(e) => setCancelReason(e.target.value)} aria-describedby="cancel-reason-hint" />
          <p className="field__hint" id="cancel-reason-hint">The customer will see this reason on their order.</p>
        </div>
      </Modal>
      <Modal open={Boolean(shipping)} onClose={() => setShipping(null)} title="Mark order as shipped"
        footer={<><Button variant="ghost" onClick={() => setShipping(null)} disabled={Boolean(savingId)}>Cancel</Button>
          <Button loading={Boolean(savingId)} onClick={confirmShipped}>Mark as shipped</Button></>}>
        <p className="muted">{shipping && orderReference(shipping)} · The customer is emailed with the tracking details.</p>
        <div className="form-grid form-grid--2">
          <Select label="Courier" value={carrier} onChange={(e) => setCarrier(e.target.value)}
            options={ORDER_CARRIERS.map((value) => ({ value, label: value }))} />
          <Input label="Tracking number (optional)" value={trackingNumber} maxLength={50} error={trackingError}
            onChange={(e) => { setTrackingNumber(e.target.value); setTrackingError(''); }}
            hint={carrier === 'Other' ? 'No tracking link is added for other couriers.' : 'A tracking link is added to the email.'} />
        </div>
      </Modal>
    </>
  );
}
