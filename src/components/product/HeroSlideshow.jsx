import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import HeroVisual from './HeroVisual';
import { collections } from '../../data/collections';
import { STONE_ORDER, stoneTheme } from '../../utils/stoneTheme';
import './HeroSlideshow.css';

const SLIDES = STONE_ORDER.map((stone) => collections.find((c) => c.stone === stone)).filter(Boolean);
const INTERVAL_MS = 4500;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Home hero slideshow: the pendant cycles through the six Infinity Stones with a caption
 * linking to each collection. Pauses on hover/focus; no auto-play when motion is reduced.
 */
export default function HeroSlideshow() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced] = useState(prefersReducedMotion);
  const slide = SLIDES[index];
  const go = (next) => setIndex((next + SLIDES.length) % SLIDES.length);

  useEffect(() => {
    if (paused || reduced) return undefined;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [index, paused, reduced]);

  return (
    <div
      className="hero-slides"
      role="region"
      aria-roledescription="carousel"
      aria-label="The six Infinity Stones"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false); }}
    >
      <HeroVisual stone={slide.stone} />

      {/* Announce changes only when the visitor is interacting, not on every auto-advance. */}
      <div key={slide.stone} className="hero-slides__caption" aria-live={paused ? 'polite' : 'off'}>
        <p className="hero-slides__gemstone">{slide.gemstone.replace(' (synthetic)', '')}</p>
        <p className="hero-slides__name">{slide.stoneName}</p>
        <p className="hero-slides__tagline">{slide.tagline}</p>
        <Link to={`/collections/${slide.slug}`} className="hero-slides__link">
          Shop {slide.stoneName} <ArrowRight size={14} strokeWidth={1.6} aria-hidden="true" />
        </Link>
      </div>

      <div className="hero-slides__controls">
        <button type="button" className="hero-slides__arrow" onClick={() => go(index - 1)} aria-label="Previous stone">
          <ChevronLeft size={18} strokeWidth={1.6} />
        </button>
        <div className="hero-slides__dots">
          {SLIDES.map((s, i) => (
            <button
              key={s.stone}
              type="button"
              className={`hero-slides__dot ${i === index ? 'is-active' : ''}`}
              style={{ background: stoneTheme(s.stone).base }}
              onClick={() => go(i)}
              aria-label={`Show ${s.stoneName}`}
              aria-current={i === index ? 'true' : undefined}
            />
          ))}
        </div>
        <button type="button" className="hero-slides__arrow" onClick={() => go(index + 1)} aria-label="Next stone">
          <ChevronRight size={18} strokeWidth={1.6} />
        </button>
      </div>
    </div>
  );
}
