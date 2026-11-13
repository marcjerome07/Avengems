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
import { PAYMENT_LABELS } from '../../services/orderService';
import { DIAMOND_STYLES, STONE_ORDER, STONE_THEME, stoneName, stoneTheme } from '../../utils/stoneTheme';

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const titleCase = (name = '') => name.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
/** Same customer, same stone color every time. */
function avatarColor(name = '') {
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return STONE_THEME[STONE_ORDER[hash % STONE_ORDER.length]].base;
}
/** "Just now", "25 min ago", "3 hours ago", "Yesterday", "4 days ago", then the date. */
function timeAgo(iso, now = Date.now()) {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}

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
            <ol className="recent-feed" role="list">
              {recent.data.map((o) => (
                <li key={o.id} className="recent-feed__item">
                  <span className="recent-feed__avatar" style={{ '--accent': avatarColor(o.customer.name) }} aria-hidden="true">
                    {initials(o.customer.name)}
                  </span>
                  <div className="recent-feed__main">
                    <p className="recent-feed__name">{titleCase(o.customer.name)}</p>
                    <p className="recent-feed__meta">
                      <OrderReference order={o} /> · {PAYMENT_LABELS[o.paymentMethod] ?? o.paymentMethod}
                      {' · '}<time dateTime={o.createdAt} title={formatDate(o.createdAt)}>{timeAgo(o.createdAt)}</time>
                    </p>
                  </div>
                  <div className="recent-feed__side">
                    <span className="recent-feed__total">{formatPrice(o.total)}</span>
                    <StatusBadge status={o.status} />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <TableSkeleton rows={5} cols={3} />
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
            <ol className="leaderboard" role="list">
              {best.data.map((p, i) => (
                <li key={p.productId} className={`leaderboard__item ${i < 3 ? `is-top is-top-${i + 1}` : ''}`}
                  style={{ '--accent': stoneTheme(p.stone).base }}>
                  <span className="leaderboard__rank" aria-label={`Rank ${i + 1}`}>{i + 1}</span>
                  <span className="leaderboard__thumb">
                    <GemVisual type={p.type} stone={p.stone} />
                  </span>
                  <div className="leaderboard__main">
                    <p className="leaderboard__name">{p.name}</p>
                    <p className="leaderboard__sub">{p.type} · {stoneName(p.stone)}</p>
                    {/* Share of units compared with the best seller */}
                    <span className="leaderboard__bar" aria-hidden="true">
                      <span style={{ width: `${Math.max(6, Math.round((p.units / best.data[0].units) * 100))}%` }} />
                    </span>
                  </div>
                  <span className="leaderboard__value">
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
