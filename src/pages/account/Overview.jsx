import { ArrowRight, Package, Clock, CircleCheck, Heart, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import { TableSkeleton } from '../../components/ui/Skeleton';
import OrdersTable from '../../components/account/OrdersTable';
import { useAuth } from '../../context/AuthContext';
import { useWishlist } from '../../context/WishlistContext';
import { getOrdersByUser } from '../../services/orderService';
import useServiceData from '../../hooks/useServiceData';
import { STONE_THEME } from '../../utils/stoneTheme';

const IN_PROGRESS = ['Pending', 'Processing', 'Shipped'];

export default function Overview() {
  const { user } = useAuth();
  const { count: wishlistCount } = useWishlist();
  const { data: orders, loading } = useServiceData(() => getOrdersByUser(user.id), [user.id]);

  const list = orders ?? [];
  const pending = list.filter((o) => IN_PROGRESS.includes(o.status)).length;
  const completed = list.filter((o) => o.status === 'Delivered').length;
  const firstName = user.name?.split(' ')[0];

  return (
    <>
      <header>
        <span className="eyebrow">My account</span>
        <h1 className="account-title" style={{ marginTop: 12 }}>
          Welcome back, {firstName}
        </h1>
        <p className="account-subtitle">Here&apos;s what&apos;s happening with your Avengems pieces.</p>
      </header>

      <div className="stat-grid">
        <StatCard label="Total Orders" value={loading ? '–' : list.length} icon={Package} accent={STONE_THEME.space.base} />
        <StatCard
          label="Pending Orders"
          value={loading ? '–' : pending}
          icon={Clock}
          hint="Pending, processing or shipped"
          accent={STONE_THEME.mind.base}
        />
        <StatCard label="Completed Orders" value={loading ? '–' : completed} icon={CircleCheck} accent={STONE_THEME.time.base} />
        <StatCard label="Wishlist Items" value={wishlistCount} icon={Heart} accent={STONE_THEME.reality.base} />
      </div>

      <section className="panel" aria-labelledby="recent-title">
        <div className="panel__head">
          <h2 id="recent-title" className="panel__title">
            Recent Orders
          </h2>
          {list.length > 0 && (
            <Link to="/account/orders" className="text-link">
              View all orders <ArrowRight size={15} />
            </Link>
          )}
        </div>
        {loading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : list.length ? (
          <OrdersTable orders={list.slice(0, 5)} />
        ) : (
          <EmptyState compact icon={ShoppingBag} title="No orders yet" message="When you place an order, it will appear here.">
            <Button to="/shop">Start shopping</Button>
          </EmptyState>
        )}
      </section>
    </>
  );
}
