import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Gem, Package, Users, UsersRound, ChartColumn, Settings, LogOut, Store, Menu, X } from 'lucide-react';
import Logo from '../../components/layout/Logo';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { DIAMOND_STYLES } from '../../utils/stoneTheme';
import './Admin.css';

const LINKS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/products', label: 'Products', icon: Gem },
  { to: '/admin/orders', label: 'Orders', icon: Package },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/members', label: 'Members & Roles', icon: UsersRound },
  { to: '/admin/analytics', label: 'Analytics', icon: ChartColumn },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

// NOTE: This area is guarded by <AdminRoute> for UX only. Every admin API call
// must be authorized by the backend.
export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function handleLogout() {
    await logout();
    showToast('You have been logged out.', { type: 'info' });
    navigate('/');
  }

  return (
    <div className="admin">
      <a href="#admin-main" className="skip-link">
        Skip to content
      </a>
      <aside className={`admin-side ${open ? 'is-open' : ''}`} aria-label="Admin navigation">
        <div className="admin-side__brand">
          <Logo to="/admin" size="sm" />
          <span className="admin-side__tag">Team dashboard</span>
          <button type="button" className="admin-side__close" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <nav onClick={() => setOpen(false)}>
          <ul role="list" className="admin-side__list">
            {LINKS.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} className="admin-side__link">
                  <Icon size={18} strokeWidth={1.5} aria-hidden="true" /> {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="admin-side__foot">
          <Link to="/" className="admin-side__link">
            <Store size={18} strokeWidth={1.5} aria-hidden="true" /> Back to store
          </Link>
          <button type="button" className="admin-side__link" onClick={handleLogout}>
            <LogOut size={18} strokeWidth={1.5} aria-hidden="true" /> Logout
          </button>
          <span className="diamonds diamonds--sm" aria-hidden="true">
            {DIAMOND_STYLES.map((style, i) => (
              <span key={i} style={style} />
            ))}
          </span>
        </div>
      </aside>
      {open && <div className="admin-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="admin-main">
        <header className="admin-top">
          <button
            type="button"
            className="nav-icon admin-top__burger"
            onClick={() => setOpen(true)}
            aria-label="Open admin menu"
            aria-expanded={open}
          >
            <Menu size={22} strokeWidth={1.4} />
          </button>
          <p className="admin-top__crumb">Avengems Admin</p>
          <div className="admin-top__user">
            <span className="admin-top__avatar" aria-hidden="true">
              {user?.name?.[0] ?? 'A'}
            </span>
            <span className="admin-top__name">
              {user?.name}
              <small>Administrator</small>
            </span>
          </div>
        </header>
        <main id="admin-main" className="admin-content" tabIndex={-1}>
          <Suspense fallback={<div className="route-loading" role="status" aria-label="Loading" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
