import { Link } from 'react-router-dom';
import OrderReference from '../../components/account/OrderReference';
import { Wallet, Package, Gem, Users, ArrowRight } from 'lucide-react';
import AdminHeader from '../../components/admin/AdminHeader';
import AdminDataState from '../../components/admin/AdminDataState';
import { SalesLineChart, StatusDonut } from '../../components/admin/Charts';
import StatCard from '../../components/ui/StatCard';
import Skeleton, { TableSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/Badge';
import GemVisual from '../../components/product/GemVisual';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getDashboardData } from '../../services/adminService';
import { formatDate, formatPrice } from '../../utils/formatPrice';
import { STONE_THEME } from '../../utils/stoneTheme';

export default function Dashboard() {
  useDocumentTitle('Admin Dashboard');
  const { data, error, reload } = useServiceData(getDashboardData);
  const sales = { data: data?.sales }, status = { data: data?.status }, recent = { data: data?.recent }, best = { data: data?.best };
  const s = data?.stats;
  if (error) return <><AdminHeader title="Dashboard" /><AdminDataState error={error} onRetry={reload} /></>;

  return (
    <>
      <AdminHeader title="Dashboard" subtitle="A quick look at how Avengems is doing." />
      <AdminDataState error={error} onRetry={reload} />
      <p className="admin-note">Demo order value excludes cancellations and includes shipping. No real payments are collected. Monthly reports use UTC.</p>

      <div className="stat-grid">
        <StatCard
          label="Total Sales"
          value={s ? formatPrice(s.totalSales) : '–'}
          icon={Wallet}
          hint="Demo order value; excludes cancellations"
          accent={STONE_THEME.mind.base}
        />
        <StatCard label="Total Orders" value={s ? s.totalOrders : '–'} icon={Package} accent={STONE_THEME.space.base} />
        <StatCard label="Total Products" value={s ? s.totalProducts : '–'} icon={Gem} accent={STONE_THEME.power.base} />
        <StatCard label="Total Customers" value={s ? s.totalCustomers : '–'} icon={Users} accent={STONE_THEME.time.base} />
      </div>

      <div className="admin-grid-2">
        <section className="panel" aria-labelledby="sales-title">
          <div className="panel__head">
            <h2 id="sales-title" className="panel__title">
              Sales Overview
            </h2>
            <span className="admin-note">Last 6 months · revenue</span>
          </div>
          {sales.data ? <SalesLineChart data={sales.data} /> : <Skeleton height={280} />}
        </section>
        <section className="panel" aria-labelledby="status-title">
          <div className="panel__head">
            <h2 id="status-title" className="panel__title">
              Order Status Overview
            </h2>
          </div>
          {status.data ? <StatusDonut data={status.data} /> : <Skeleton height={220} />}
        </section>
      </div>

      <div className="admin-grid-2">
        <section className="panel" aria-labelledby="recent-title">
          <div className="panel__head">
            <h2 id="recent-title" className="panel__title">
              Recent Orders
            </h2>
            <Link to="/admin/orders" className="text-link">
              All orders <ArrowRight size={15} />
            </Link>
          </div>
          {recent.data ? (
            <div className="table-wrap">
              <table className="rtable">
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Date</th>
                    <th scope="col" className="num">
                      Total
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.data.map((o) => (
                    <tr key={o.id}>
                      <td data-label="Order" className="strong">
                        <OrderReference order={o} />
                      </td>
                      <td data-label="Customer">{o.customer.name}</td>
                      <td data-label="Date">{formatDate(o.createdAt)}</td>
                      <td data-label="Total" className="num strong">
                        {formatPrice(o.total)}
                      </td>
                      <td data-label="Status">
                        <StatusBadge status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <TableSkeleton rows={5} cols={5} />
          )}
          {recent.data?.length === 0 && <p>No persisted orders yet.</p>}
        </section>

        <section className="panel" aria-labelledby="best-title">
          <div className="panel__head">
            <h2 id="best-title" className="panel__title">
              Best Selling Products
            </h2>
          </div>
          {best.data ? (
            <ol className="rank-list" role="list">
              {best.data.map((p, i) => (
                <li key={p.productId}>
                  <span className="rank-list__n">{i + 1}</span>
                  <span className="cell-product__thumb">
                    <GemVisual type={p.type} stone={p.stone} />
                  </span>
                  <span>
                    <span className="cell-product__name">{p.name}</span>
                    <span className="cell-product__sub" style={{ display: 'block' }}>
                      {p.type}
                    </span>
                  </span>
                  <span className="rank-list__value">
                    {p.units} sold
                    <small>{formatPrice(p.revenue)}</small>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Skeleton height={260} />
          )}
          {best.data?.length === 0 && <p>No best sellers yet.</p>}
        </section>
      </div>
    </>
  );
}
