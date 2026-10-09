import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Search, User, ShoppingBag, Menu, LayoutDashboard, Package, UserRound, Heart, LogOut } from 'lucide-react';
import Logo from './Logo';
import MobileMenu from './MobileMenu';
import SearchOverlay from './SearchOverlay';
import { NAV_LINKS } from './navLinks';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import './Navbar.css';

function AccountMenu() {
  const { user, isAdmin, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    function onClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    await logout();
    showToast('You have been logged out.', { type: 'info' });
    navigate('/');
  }

  if (!user) {
    return (
      <Link to="/login" className="nav-icon" aria-label="Log in or create an account">
        <User size={21} strokeWidth={1.4} />
      </Link>
    );
  }

  const firstName = user.name?.split(' ')[0] ?? 'there';

  return (
    <div className="account-menu" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`nav-icon ${open ? 'is-active' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="account-dropdown"
        aria-label={`Account menu for ${user.name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <User size={21} strokeWidth={1.4} />
        <span className="nav-icon__status" aria-hidden="true" />
      </button>
      {open && (
        <div id="account-dropdown" className="account-menu__panel">
          <div className="account-menu__head">
            <p className="account-menu__hello">Hello, {firstName}</p>
            <p className="account-menu__email">{user.email}</p>
          </div>
          <ul role="list" className="account-menu__list" onClick={() => setOpen(false)}>
            {isAdmin && (
              <li>
                <Link to="/admin" className="account-menu__item">
                  <LayoutDashboard size={17} strokeWidth={1.5} /> Dashboard
                </Link>
              </li>
            )}
            <li>
              <Link to="/account/profile" className="account-menu__item">
                <UserRound size={17} strokeWidth={1.5} /> Profile
              </Link>
            </li>
            <li>
              <Link to="/account/orders" className="account-menu__item">
                <Package size={17} strokeWidth={1.5} /> Orders
              </Link>
            </li>
            <li>
              <Link to="/account/wishlist" className="account-menu__item">
                <Heart size={17} strokeWidth={1.5} /> Wishlist
              </Link>
            </li>
            <li>
              <button type="button" className="account-menu__item account-menu__logout" onClick={handleLogout}>
                <LogOut size={17} strokeWidth={1.5} /> Logout
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const { itemCount } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header className={`navbar ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="container navbar__inner">
          <button type="button" className="nav-icon navbar__burger" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <Menu size={22} strokeWidth={1.4} />
          </button>

          <Logo />

          <nav className="navbar__links" aria-label="Main">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className="navbar__link">
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="navbar__actions">
            <button type="button" className="nav-icon" aria-label="Search products" onClick={() => setSearchOpen(true)}>
              <Search size={21} strokeWidth={1.4} />
            </button>
            <div className="navbar__account">
              <AccountMenu />
            </div>
            <Link to="/cart" className="nav-icon" aria-label={`Shopping bag, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}>
              <ShoppingBag size={21} strokeWidth={1.4} />
              {itemCount > 0 && (
                <span className="nav-icon__badge" aria-hidden="true">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
