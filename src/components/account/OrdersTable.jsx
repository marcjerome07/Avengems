import { Link } from 'react-router-dom';
import { StatusBadge } from '../ui/Badge';
import { formatDate, formatPrice } from '../../utils/formatPrice';

/** Customer order list. Becomes stacked cards on small screens. */
export default function OrdersTable({ orders }) {
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
                  {o.id}
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
                </td>
                <td data-label="" className="num">
                  <Link to={`/account/orders/${o.id}`} className="text-link" aria-label={`View order ${o.id}`}>
                    View Order
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
