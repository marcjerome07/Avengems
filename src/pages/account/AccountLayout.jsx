import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutGrid, Package, Heart, UserRound, MapPin, ShieldCheck, LogOut } from 'lucide-react';
import PageContainer from '../../components/layout/PageContainer';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import './Account.css';

const LINKS = [
  { to: '/account', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/account/orders', label: 'My Orders', icon: Package },
  { to: '/account/wishlist', label: 'Wishlist', icon: Heart },
  { to: '/account/profile', label: 'Profile', icon: UserRound },
  { to: '/account/addresses', label: 'Addresses', icon: MapPin },
  { to: '/account/security', label: 'Security', icon: ShieldCheck },
];

export default function AccountLayout() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    showToast('You have been logged out.', { type: 'info' });
    navigate('/');
  }

  return (
    <PageContainer title="My Account" className="account">
      <div className="account-layout">
        <aside className="account-nav" aria-label="Account">
          <div className="account-nav__user">
            <span className="account-nav__avatar" aria-hidden="true">
              {user?.name?.[0]?.toUpperCase() ?? 'A'}
            </span>
            <div>
              <p className="account-nav__name">{user?.name}</p>
              <p className="account-nav__email">{user?.email}</p>
            </div>
          </div>
          <nav>
            <ul role="list" className="account-nav__list">
              {LINKS.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink to={to} end={end} className="account-nav__link">
                    <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              ))}
              <li>
                <button type="button" className="account-nav__link account-nav__logout" onClick={handleLogout}>
                  <LogOut size={18} strokeWidth={1.5} aria-hidden="true" />
                  Logout
                </button>
              </li>
            </ul>
          </nav>
        </aside>
        <div className="account-content">
          <Outlet />
        </div>
      </div>
    </PageContainer>
  );
}
