import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, PackageSearch } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/Badge';
import { TotalsList, MiniItems } from '../../components/cart/OrderSummary';
import { useAuth } from '../../context/useAuth';
import { getOrderById, getOrdersByUser, PAYMENT_LABELS } from '../../services/orderService';
import CancelOrderAction from '../../components/account/CancelOrderAction';
import OrderReference from '../../components/account/OrderReference';
import PaymentActions from '../../components/account/PaymentStatus';
import { orderReference } from '../../utils/orderReference';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatDate } from '../../utils/formatPrice';

const FLOW = ['Pending', 'Processing', 'Shipped', 'Delivered'];

export function Timeline({ status }) {
  if (status === 'Cancelled') {
    return <p className="order-cancelled">This order was cancelled. No shipment is being prepared. Refunds are reviewed separately from inventory returns.</p>;
  }
  const current = FLOW.indexOf(status);
  return (
    <ol className="timeline" aria-label="Order progress">
      {FLOW.map((step, i) => (
        <li
          key={step}
          className={`${i <= current ? 'is-done' : ''} ${i === current ? 'is-current' : ''}`}
          aria-current={i === current ? 'step' : undefined}
        >
          <span className="timeline__dot">{i <= current && <Check size={14} strokeWidth={2.2} aria-hidden="true" />}</span>
          {step}
        </li>
      ))}
    </ol>
  );
}

export default function OrderDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: order, loading, error, reload, setData } = useServiceData(() => getOrderById(id, { userId: user.id }), [id, user.id]);
  useDocumentTitle(`Order ${orderReference(order ?? { id })}`);
  const [notice, setNotice] = useState('');
  async function cancelled(updated) {
    setData(updated); setNotice('Order cancelled.');
    try {
      const history = await getOrdersByUser(user.id);
      const latest = history.find((entry) => entry.id === updated.id);
      if (latest) setData({ ...latest, canCancel: false });
    } catch { setNotice('Order cancelled. Order history could not be refreshed; reload to check it.'); }
  }

  const back = (
    <Link to="/account/orders" className="text-link text-link--ink">
      <ArrowLeft size={15} /> All orders
    </Link>
  );

  if (error) {
    return (
      <>
        {back}
        <EmptyState icon={PackageSearch} title={error.status === 404 ? 'Order not found' : 'Unable to load order'} message={error.message}>
          <Button onClick={reload}>Retry order</Button>
          <Button to="/account/orders">View My Orders</Button>
        </EmptyState>
      </>
    );
  }

  if (loading || !order) {
    return (
      <div role="status" aria-label="Loading order" style={{ display: 'grid', gap: 16 }}>
        <Skeleton height={40} width="50%" />
        <Skeleton height={80} />
        <Skeleton height={240} />
      </div>
    );
  }

  return (
    <>
      {back}
      <header className="account-head">
        <div>
          <h1 className="account-title"><OrderReference order={order} /></h1>
          <p className="account-subtitle">Placed on {formatDate(order.createdAt, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <StatusBadge status={order.status} />
      </header>
      {notice && <p role="status">{notice}</p>}
      <PaymentActions key={`${user.id}:${order.id}`} order={order} ownerId={user.id} onChanged={reload} />
      <CancelOrderAction key={`${user.id}:${order.id}`} order={order} ownerId={user.id} onCancelled={cancelled} onRefresh={reload} />

      <section className="panel" aria-label="Order progress">
        <Timeline status={order.status} />
      </section>

      <div className="order-detail__grid">
        <section className="panel" aria-labelledby="items-title">
          <h2 id="items-title" className="panel__title" style={{ marginBottom: 20 }}>
            Items
          </h2>
          <MiniItems items={order.items} />
        </section>
        <div className="order-detail__side">
          <section className="panel order-detail__info">
            <h3>Shipping</h3>
            <p>{order.customer.name}</p>
            <p>{order.shipping.address}</p>
            <p>
              {order.shipping.city}, {order.shipping.province} {order.shipping.postalCode}
            </p>
            <p>{order.customer.phone}</p>
          </section>
          <section className="panel order-detail__info">
            <h3>Payment</h3>
            <p>{PAYMENT_LABELS[order.paymentMethod]}</p>
          </section>
          <section className="panel">
            <TotalsList totals={order} />
          </section>
        </div>
      </div>
    </>
  );
}
