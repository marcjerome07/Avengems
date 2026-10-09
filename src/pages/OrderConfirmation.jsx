import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CircleCheck, PackageSearch } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/Badge';
import { TotalsList, MiniItems } from '../components/cart/OrderSummary';
import { useAuth } from '../context/AuthContext';
import { getOrderById, PAYMENT_LABELS } from '../services/orderService';
import { formatDate, formatPrice } from '../utils/formatPrice';
import { DIAMOND_STYLES } from '../utils/stoneTheme';
import './OrderConfirmation.css';

export default function OrderConfirmation() {
  const { orderId } = useParams();
  const { user, isAdmin } = useAuth();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let active = true;
    getOrderById(orderId, { userId: user?.id, isAdmin })
      .then((order) => active && setState({ status: 'ready', order }))
      .catch(() => active && setState({ status: 'missing' }));
    return () => {
      active = false;
    };
  }, [orderId, user?.id, isAdmin]);

  if (state.status === 'missing') {
    return (
      <PageContainer title="Order not found">
        <EmptyState
          headingLevel={1}
          icon={PackageSearch}
          title="We couldn't find that order"
          message="Check your order list for the latest status of your purchases."
        >
          <Button to="/account/orders">View My Orders</Button>
        </EmptyState>
      </PageContainer>
    );
  }

  const { order } = state;

  return (
    <PageContainer title="Thank you" narrow className="confirm">
      <div className="confirm__hero">
        <span className="confirm__icon" aria-hidden="true">
          <CircleCheck size={44} strokeWidth={1.2} />
        </span>
        <h1 className="confirm__title">Thank you for your order.</h1>
        <p className="confirm__lead">Your Avengems journey has begun.</p>
        <span className="diamonds" aria-hidden="true">
          {DIAMOND_STYLES.map((style, i) => (
            <span key={i} style={style} />
          ))}
        </span>
      </div>

      {!order ? (
        <div className="confirm__card" role="status" aria-label="Loading order">
          <Skeleton height={20} width="50%" />
          <Skeleton height={120} />
          <Skeleton height={80} />
        </div>
      ) : (
        <div className="confirm__card">
          <dl className="confirm__facts">
            <div>
              <dt>Order number</dt>
              <dd className="confirm__number">{order.id}</dd>
            </div>
            <div>
              <dt>Order date</dt>
              <dd>{formatDate(order.createdAt, { year: 'numeric', month: 'long', day: 'numeric' })}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatPrice(order.total)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={order.status} />
              </dd>
            </div>
          </dl>

          <section className="confirm__section" aria-labelledby="ship-title">
            <h2 id="ship-title">Shipping to</h2>
            <p>{order.customer.name}</p>
            <p>
              {order.shipping.address}, {order.shipping.city}, {order.shipping.province} {order.shipping.postalCode}
            </p>
            <p>
              {order.customer.phone} · {order.customer.email}
            </p>
            <p className="confirm__payment">Payment: {PAYMENT_LABELS[order.paymentMethod]}</p>
          </section>

          <section className="confirm__section" aria-labelledby="items-title">
            <h2 id="items-title">Your pieces</h2>
            <MiniItems items={order.items} />
          </section>

          <TotalsList totals={order} />
        </div>
      )}

      <div className="confirm__actions">
        <Button to="/account/orders">View My Orders</Button>
        <Button to="/shop" variant="outline">
          Continue Shopping
        </Button>
      </div>
    </PageContainer>
  );
}
