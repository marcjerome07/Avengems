import './Badge.css';

/** variant: neutral | new | custom | oos | success | error | warning | info | bronze */
export default function Badge({ variant = 'neutral', children, className = '' }) {
  return <span className={`badge badge--${variant} ${className}`}>{children}</span>;
}

const STATUS_VARIANT = {
  Pending: 'warning',
  Processing: 'info',
  Shipped: 'bronze',
  Delivered: 'success',
  Cancelled: 'error',
  Active: 'success',
  Inactive: 'neutral',
};

export function StatusBadge({ status }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'neutral'} className="badge--status">
      {status}
    </Badge>
  );
}
