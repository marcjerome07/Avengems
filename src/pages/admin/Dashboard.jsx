import { Link } from 'react-router-dom';
import OrderReference from '../../components/account/OrderReference';
import { Wallet, Package, Gem, Users, ArrowRight } from 'lucide-react';
import AdminHeader from '../../components/admin/AdminHeader';
import AdminDataState from '../../components/admin/AdminDataState';
import { useState } from 'react';
import { SalesChart, StatusDonut } from '../../components/admin/Charts';
import StatCard from '../../components/ui/StatCard';
import Skeleton, { TableSkeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/Badge';
import GemVisual from '../../components/product/GemVisual';
import { useAuth } from '../../context/useAuth';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getDashboardData } from '../../services/adminService';
import { formatDate, formatPrice } from '../../utils/formatPrice';
import { DIAMOND_STYLES, STONE_THEME } from '../../utils/stoneTheme';

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** "Good morning" etc. and today's date, both in Philippine time. */
function greeting(now = new Date()) {
  const hour = Number(now.toLocaleString('en-PH', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' })) % 24;
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const date = now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
  return { part, date };
}

export default function Dashboard() {
  useDocumentTitle('Admin Dashboard');
  const { user } = useAuth();
  const { data, error, reload } = useServiceData(getDashboardData);
  const [range, setRange] = useState('daily');
  // Older servers send monthly sales only: fall back to it instead of an empty chart.
  const hasDaily = Array.isArray(data?.daily);
  const showDaily = hasDaily && range === 'daily';
  const sales = { data: showDaily ? data.daily : data?.sales }, status = { data: data?.status }, recent = { data: data?.recent }, best = { data: data?.best };
  const s = data?.stats;
  const periodTotal = sales.data?.reduce((sum, point) => sum + (point.sales ?? 0), 0);
  const lastWeek = hasDaily ? data.daily.slice(-7).reduce((sum, day) => sum + day.sales, 0) : null;
  const { part, date } = greeting();
  const firstName = user?.name?.split(' ')[0];
  if (error) return <><AdminHeader title="Dashboard" /><AdminDataState error={error} onRetry={reload} /></>;

  return (
    <>
      <header className="dash-hero">
        <div>
          <p className="dash-hero__date">{date}</p>
          <h1 className="dash-hero__title">{part}{firstName ? `, ${firstName}` : ''}.</h1>
          <p className="dash-hero__lede">Here’s how Avengems is doing. Sales count money received: paid GCash and card orders, plus Cash on Delivery once delivered.</p>
        </div>
        <span className="diamonds dash-hero__gems" aria-hidden="true">
          {DIAMOND_STYLES.map((style, i) => (
            <span key={i} style={style} />
          ))}
        </span>
      </header>

      <div className="stat-grid">
        <StatCard
          label="Total Sales"
          value={s ? formatPrice(s.totalSales) : '–'}
          icon={Wallet}
          highlight={isNumber(lastWeek) ? `${formatPrice(lastWeek)} in the last 7 days` : undefined}
          hint={isNumber(s?.awaitingCollection) ? `${formatPrice(s.awaitingCollection)} more awaiting Cash on Delivery` : 'Money received'}
          accent={STONE_THEME.mind.base}
        />
        <StatCard label="Total Orders" value={s ? s.totalOrders : '–'} icon={Package}
          hint={isNumber(s?.cancelledOrders) ? `Including ${s.cancelledOrders} cancelled` : 'All orders placed'} accent={STONE_THEME.space.base} />
        <StatCard label="Total Products" value={s ? s.totalProducts : '–'} icon={Gem} hint="In the shop (not archived)" accent={STONE_THEME.power.base} />
        <StatCard label="Total Customers" value={s ? s.totalCustomers : '–'} icon={Users} hint="Verified accounts" accent={STONE_THEME.time.base} />
      </div>

      <div className="admin-grid-2">
        <section className="panel" aria-labelledby="sales-title">
          <div className="panel__head">
            <div>
              <h2 id="sales-title" className="panel__title">
                Sales Overview
              </h2>
              {isNumber(periodTotal) && (
                <p className="sales-total">
                  <strong>{formatPrice(periodTotal)}</strong> received {showDaily ? 'in the last 30 days' : 'in the last 6 months'}
                </p>
              )}
            </div>
            {hasDaily && (
              <div className="sales-range" role="group" aria-label="Sales period">
                {[['daily', 'Last 30 days'], ['monthly', 'Last 6 months']].map(([value, label]) => (
                  <button key={value} type="button" className={`pill ${range === value ? 'is-active' : ''}`}
                    aria-pressed={range === value} onClick={() => setRange(value)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {sales.data ? <SalesChart data={sales.data.map((point) => ({ ...point, label: point.label ?? point.month }))} /> : <Skeleton height={280} />}
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
          {recent.data?.length === 0 && <p>No orders yet.</p>}
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
