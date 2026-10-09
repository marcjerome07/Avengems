import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, PackageSearch } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/Badge';
import { TotalsList, MiniItems } from '../../components/cart/OrderSummary';
import { useAuth } from '../../context/AuthContext';
import { getOrderById, PAYMENT_LABELS } from '../../services/orderService';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { formatDate } from '../../utils/formatPrice';

const FLOW = ['Pending', 'Processing', 'Shipped', 'Delivered'];

function Timeline({ status }) {
  if (status === 'Cancelled') {
    return <p className="order-cancelled">This order was cancelled. Any payment made will be refunded within 5–7 business days.</p>;
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
  useDocumentTitle(`Order ${id}`);
  const { data: order, loading, error } = useServiceData(() => getOrderById(id, { userId: user.id }), [id, user.id]);

  const back = (
    <Link to="/account/orders" className="text-link text-link--ink">
      <ArrowLeft size={15} /> All orders
    </Link>
  );

  if (error) {
    return (
      <>
        {back}
        <EmptyState icon={PackageSearch} title="Order not found" message="We couldn't find that order in your account.">
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
          <h1 className="account-title">{order.id}</h1>
          <p className="account-subtitle">Placed on {formatDate(order.createdAt, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <StatusBadge status={order.status} />
      </header>

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
