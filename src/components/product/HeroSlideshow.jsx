import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import HeroVisual from './HeroVisual';
import { collections } from '../../data/collections';
import './HeroSlideshow.css';

// How long each slide stays before the next one (milliseconds).
const SLIDE_INTERVAL_MS = 4000;
// The photo shown first on every page load (matched by file name, any extension).
const FIRST_SLIDE_NAME = 'model';
const SWIPE_PX = 40;

// Every file in src/assets/featured, as { path: url }. Vite lists the folder when it builds,
// so adding or deleting an image there is all it takes. Only URLs are collected here:
// the browser downloads an image when its slide is about to be shown.
const FILES = import.meta.glob('../../assets/featured/*', { eager: true, query: '?url', import: 'default' });
const IMAGE = /\.(png|jpe?g|webp|avif|gif)$/i;

/**
 * "Mind Stone Bracelet.PNG" -> caption from the Mind Stone collection and alt text
 * "Mind Stone bracelet with Citrine". Other files (like model.png) have no caption,
 * so no product names are made up.
 */
function toSlide(path, src) {
  const name = path.split('/').pop().replace(/\.[^.]+$/, '');
  const match = /^(\w+) Stone (.+)$/i.exec(name);
  const collection = (match && collections.find((c) => c.stone === match[1].toLowerCase())) ?? null;
  const gemstone = collection?.gemstone.replace(' (synthetic)', '');
  return {
    src,
    name,
    collection,
    gemstone,
    alt: collection ? `${collection.stoneName} ${match[2].toLowerCase()} with ${gemstone}` : 'Featured Avengems jewelry',
  };
}

const SLIDES = Object.entries(FILES).filter(([path]) => IMAGE.test(path)).map(([path, src]) => toSlide(path, src));

/** Fisher–Yates shuffle: every order is equally likely. Returns a new array. */
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * model.* first, then every other photo once, in a new random order each page load.
 * Each photo appears once per round, so the same one never shows twice in a row,
 * also when the loop goes from the last photo back to model.
 */
function slideOrder() {
  const first = SLIDES.filter((s) => s.name.toLowerCase() === FIRST_SLIDE_NAME);
  const rest = SLIDES.filter((s) => s.name.toLowerCase() !== FIRST_SLIDE_NAME);
  return [...first, ...shuffle(rest)];
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Home hero slideshow of the featured product photos.
 * - Advances every SLIDE_INTERVAL_MS and loops; pauses while the mouse is over it, an arrow
 *   has keyboard focus, or the tab is hidden. No auto-play when the visitor prefers reduced motion.
 * - Arrows and swipe change slides; any change restarts the timer.
 * - Only the current, next and already-loaded images are in the page. An image that fails
 *   to load is dropped from the slideshow.
 */
export default function HeroSlideshow() {
  const [order] = useState(slideOrder);
  const [failed, setFailed] = useState(() => new Set());
  const [loaded, setLoaded] = useState(() => new Set());
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tabHidden, setTabHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [reduced] = useState(prefersReducedMotion);
  const touchStartX = useRef(null);

  const slides = order.filter((s) => !failed.has(s.src));
  const count = slides.length;
  const current = count ? index % count : 0;
  const slide = slides[current];
  const next = slides[(current + 1) % count];
  const paused = hovered || focused || tabHidden || reduced || count < 2;

  const go = (target) => setIndex(((target % count) + count) % count);

  // Auto-advance. Re-runs whenever the slide changes, so an arrow click or swipe restarts
  // the countdown; the cleanup clears the old timer (no double timers, also in StrictMode).
  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), SLIDE_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [current, paused, count]);

  useEffect(() => {
    const update = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  // No images at all (or none loaded): fall back to the illustrated pendant.
  if (!slide) return <HeroVisual />;

  function onTouchEnd(event) {
    if (touchStartX.current === null) return;
    const dx = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > SWIPE_PX) go(current + (dx < 0 ? 1 : -1));
  }

  const caption = slide.collection;
  return (
    <div
      className="hero-slides"
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured Avengems pieces"
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHovered(true); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHovered(false); }}
      // Pause for keyboard focus only; a mouse click on an arrow should not stop auto-play.
      onFocus={(e) => { if (e.target.matches(':focus-visible')) setFocused(true); }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={onTouchEnd}
    >
      {slides.map((s) => (s === slide || s === next || loaded.has(s.src)) && (
        <img
          key={s.src}
          src={s.src}
          alt={s === slide ? s.alt : ''}
          aria-hidden={s === slide ? undefined : 'true'}
          className={`hero-slides__img ${s === slide ? 'is-active' : ''}`}
          // The first slide is the most important image on the page; the rest can wait.
          fetchPriority={s === slide && loaded.size === 0 ? 'high' : 'auto'}
          decoding="async"
          draggable="false"
          // Loaded images stay in the page, so the fade-out and going back need no re-download.
          onLoad={() => setLoaded((now) => (now.has(s.src) ? now : new Set(now).add(s.src)))}
          onError={() => setFailed((f) => new Set(f).add(s.src))}
        />
      ))}

      {/* Stone photos get their collection's caption; photos without one show none. */}
      {caption && (
        <div key={slide.src} className="hero-slides__caption">
          <p className="hero-slides__gemstone">{slide.gemstone}</p>
          <p className="hero-slides__name">{caption.stoneName}</p>
          <p className="hero-slides__tagline">{caption.tagline}</p>
          <Link to={`/collections/${caption.slug}`} className="hero-slides__link">
            Shop {caption.stoneName} <ArrowRight size={14} strokeWidth={1.6} aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Screen readers hear the position, replacing the page dots. Only while the visitor is
          interacting (hover or keyboard focus), not on every automatic change. */}
      <p className="visually-hidden" aria-live={paused ? 'polite' : 'off'} aria-atomic="true">
        Slide {current + 1} of {count}: {slide.alt}
      </p>

      {count > 1 && (
        <div className="hero-slides__controls">
          <button type="button" className="hero-slides__arrow" onClick={() => go(current - 1)} aria-label="Previous slide">
            <ChevronLeft size={18} strokeWidth={1.6} />
          </button>
          <button type="button" className="hero-slides__arrow" onClick={() => go(current + 1)} aria-label="Next slide">
            <ChevronRight size={18} strokeWidth={1.6} />
          </button>
        </div>
      )}
    </div>
  );
}
