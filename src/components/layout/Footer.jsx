import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import Logo from './Logo';
import { DIAMOND_STYLES, STONE_ORDER, stoneVar } from '../../utils/stoneTheme';
import './Footer.css';

const CONTACT_EMAIL = 'avengems2026@gmail.com';

const COLUMNS = [
  {
    title: 'Shop',
    links: [
      { to: '/shop?type=Ring', label: 'Rings' },
      { to: '/shop?type=Necklace', label: 'Necklaces' },
      { to: '/shop?type=Bracelet', label: 'Bracelets' },
      { to: '/shop?type=Earrings', label: 'Earrings' },
      { to: '/collections', label: 'Collections' },
    ],
  },
  {
    title: 'Customer',
    links: [
      { to: '/account', label: 'My Account' },
      { to: '/account/orders', label: 'Orders' },
      { to: '/account/wishlist', label: 'Wishlist' },
      { to: '/shipping', label: 'Shipping' },
      { to: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'About',
    links: [
      { to: '/about', label: 'About Us' },
      { to: '/about#team', label: 'Our Team' },
      { to: '/terms', label: 'Terms' },
      { to: '/privacy', label: 'Privacy' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__gemline" aria-hidden="true">
        {STONE_ORDER.map((s) => (
          <span key={s} style={{ background: stoneVar(s) }} />
        ))}
      </div>
      <div className="container footer__inner">
        <div className="footer__brand">
          <Logo size="lg" showMark={false} />
          <p className="footer__tagline">Gemstone jewelry inspired by the six stones.</p>
          <span className="diamonds" aria-hidden="true">
            {DIAMOND_STYLES.map((style, i) => (
              <span key={i} style={style} />
            ))}
          </span>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} className="footer__col" aria-label={`Footer ${col.title}`}>
            <h2 className="footer__heading">{col.title}</h2>
            <ul role="list">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="footer__link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div className="footer__col">
          <h2 className="footer__heading">Get in touch</h2>
          <a href={`mailto:${CONTACT_EMAIL}`} className="footer__email">
            <Mail size={16} strokeWidth={1.5} aria-hidden="true" />
            {CONTACT_EMAIL}
          </a>
          <p className="footer__note">We reply within 1–2 business days.</p>
        </div>
      </div>
      <div className="container footer__bottom">
        <p>© 2026 Avengems.</p>
        <p>Concept collection · Illustrative product visuals</p>
      </div>
    </footer>
  );
}
