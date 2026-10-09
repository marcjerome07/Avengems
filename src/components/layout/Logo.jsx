import { Link } from 'react-router-dom';
import { Sparkle } from 'lucide-react';
import './Logo.css';

export default function Logo({ to = '/', size = 'md', showMark = true, onClick }) {
  return (
    <Link to={to} className={`logo logo--${size}`} aria-label="Avengems home" onClick={onClick}>
      <span className="logo__word">AVENGEMS</span>
      {showMark && <Sparkle className="logo__mark" size={size === 'lg' ? 22 : 18} strokeWidth={1.3} aria-hidden="true" />}
    </Link>
  );
}
