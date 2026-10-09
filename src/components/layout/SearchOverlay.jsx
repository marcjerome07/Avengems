import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import Modal from '../ui/Modal';
import './SearchOverlay.css';

const SUGGESTIONS = ['Rings', 'Necklace', 'Amethyst', 'Citrine', 'Sterling silver', 'Earrings'];

export default function SearchOverlay({ open, onClose }) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  function go(q) {
    const trimmed = q.trim();
    onClose();
    setQuery('');
    navigate(trimmed ? `/shop?q=${encodeURIComponent(trimmed)}` : '/shop');
  }

  return (
    <Modal open={open} onClose={onClose} title="Search Avengems" size="md">
      <form
        className="search-overlay"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(query);
        }}
      >
        <label htmlFor="site-search" className="visually-hidden">
          Search for jewelry
        </label>
        <div className="search-overlay__field">
          <Search size={20} strokeWidth={1.5} aria-hidden="true" />
          <input
            id="site-search"
            type="search"
            data-autofocus
            placeholder="Search rings, stones, colors…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="search-overlay__submit" aria-label="Search">
            <ArrowRight size={20} strokeWidth={1.5} />
          </button>
        </div>
        <p className="search-overlay__label">Popular searches</p>
        <div className="search-overlay__chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="search-overlay__chip" onClick={() => go(s)}>
              {s}
            </button>
          ))}
        </div>
      </form>
    </Modal>
  );
}
