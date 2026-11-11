import { Link } from 'react-router-dom';
import OrderReference from './OrderReference';
import CancelOrderAction from './CancelOrderAction';
import { getCancellationReasons, cancellationReasonText } from '../../services/cancellationReasons';
import { PaymentStatus } from './PaymentStatus';
import { orderReference } from '../../utils/orderReference';
import { StatusBadge } from '../ui/Badge';
import { formatDate, formatPrice } from '../../utils/formatPrice';

/**
 * Customer order list. Becomes stacked cards on small screens.
 * Pass ownerId (and onCancelled) to show a "Cancel order" button under each order.
 */
export default function OrdersTable({ orders, ownerId, onCancelled, onRefresh }) {
  const savedReasons = getCancellationReasons(ownerId);
  return (
    <div className="table-wrap">
      <table className="rtable">
        <thead>
          <tr>
            <th scope="col">Order Number</th>
            <th scope="col">Date</th>
            <th scope="col">Items</th>
            <th scope="col" className="num">
              Total
            </th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const count = o.items.reduce((n, i) => n + i.quantity, 0);
            return (
              <tr key={o.id}>
                <td data-label="Order" className="strong">
                  <OrderReference order={o} />
                </td>
                <td data-label="Date">{formatDate(o.createdAt)}</td>
                <td data-label="Items">
                  {count} {count === 1 ? 'piece' : 'pieces'}
                </td>
                <td data-label="Total" className="num strong">
                  {formatPrice(o.total)}
                </td>
                <td data-label="Status">
                  <StatusBadge status={o.status} />
                  <div>Payment: <PaymentStatus order={o} /></div>
                  {o.status === 'Cancelled' && cancellationReasonText(o, savedReasons) && (
                    <div className="order-row-reason">Reason: {cancellationReasonText(o, savedReasons)}</div>
                  )}
                </td>
                <td data-label="" className="num">
                  <div className="order-row-actions">
                    <Link to={`/account/orders/${encodeURIComponent(o.id)}`} className="text-link" aria-label={`View order ${orderReference(o)}`}>
                      View Order
                    </Link>
                    {ownerId && <CancelOrderAction order={o} ownerId={ownerId} onCancelled={onCancelled} onRefresh={onRefresh} />}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
