import { NavLink, Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut, Package, UserRound, Heart, LogIn, UserPlus } from 'lucide-react';
import Modal from '../ui/Modal';
import Logo from './Logo';
import { NAV_LINKS } from './navLinks';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { DIAMOND_STYLES } from '../../utils/stoneTheme';
import './MobileMenu.css';

export default function MobileMenu({ open, onClose }) {
  const { user, isAdmin, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  async function handleLogout() {
    onClose();
    await logout();
    showToast('You have been logged out.', { type: 'info' });
    navigate('/');
  }

  return (
    <Modal open={open} onClose={onClose} title="Menu" variant="drawer" hideTitle>
      <div className="mobile-menu">
        <div className="mobile-menu__logo">
          <Logo size="sm" onClick={onClose} />
        </div>

        <nav aria-label="Mobile">
          <ul role="list" className="mobile-menu__links">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} end={link.end} className="mobile-menu__link" onClick={onClose}>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mobile-menu__account">
          {user ? (
            <>
              <p className="mobile-menu__hello">Signed in as {user.name}</p>
              <ul role="list" className="mobile-menu__sub">
                {isAdmin && (
                  <li>
                    <Link to="/admin" onClick={onClose}>
                      <LayoutDashboard size={18} strokeWidth={1.5} /> Dashboard
                    </Link>
                  </li>
                )}
                <li>
                  <Link to="/account/profile" onClick={onClose}>
                    <UserRound size={18} strokeWidth={1.5} /> Profile
                  </Link>
                </li>
                <li>
                  <Link to="/account/orders" onClick={onClose}>
                    <Package size={18} strokeWidth={1.5} /> Orders
                  </Link>
                </li>
                <li>
                  <Link to="/account/wishlist" onClick={onClose}>
                    <Heart size={18} strokeWidth={1.5} /> Wishlist
                  </Link>
                </li>
                <li>
                  <button type="button" onClick={handleLogout}>
                    <LogOut size={18} strokeWidth={1.5} /> Logout
                  </button>
                </li>
              </ul>
            </>
          ) : (
            <ul role="list" className="mobile-menu__sub">
              <li>
                <Link to="/login" onClick={onClose}>
                  <LogIn size={18} strokeWidth={1.5} /> Log in
                </Link>
              </li>
              <li>
                <Link to="/signup" onClick={onClose}>
                  <UserPlus size={18} strokeWidth={1.5} /> Create an account
                </Link>
              </li>
            </ul>
          )}
        </div>

        <div className="mobile-menu__foot">
          <span className="diamonds diamonds--sm" aria-hidden="true">
            {DIAMOND_STYLES.map((style, i) => (
              <span key={i} style={style} />
            ))}
          </span>
          <p>A little color. A little meaning. A piece of you.</p>
        </div>
      </div>
    </Modal>
  );
}
