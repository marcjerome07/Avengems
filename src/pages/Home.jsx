import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Palette, Gift, Gem as GemIcon, Mail } from 'lucide-react';
import useDocumentTitle from '../hooks/useDocumentTitle';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Skeleton from '../components/ui/Skeleton';
import HeroVisual from '../components/product/HeroVisual';
import CollectionCard from '../components/product/CollectionCard';
import ProductGrid from '../components/product/ProductGrid';
import { useToast } from '../context/ToastContext';
import { getCollections, getFeaturedProducts, getPackages } from '../services/productService';
import { formatPriceShort } from '../utils/formatPrice';
import { validateEmail } from '../utils/validators';
import { DIAMOND_STYLES } from '../utils/stoneTheme';
import './Home.css';

const PROMISES = [
  { icon: ShieldCheck, title: 'Hypoallergenic', text: 'Nickel-free 925 sterling silver and surgical-grade stainless steel.' },
  { icon: Palette, title: 'Customizable', text: 'Choose your size or swap your stone color on selected pieces.' },
  { icon: Gift, title: 'Branded packaging', text: 'Every piece arrives in a pouch or keepsake box, ready to gift.' },
  { icon: GemIcon, title: 'Accessible luxury', text: 'Considered design and real gemstones from ₱299.' },
];

function Hero() {
  function scrollToStones(e) {
    e.preventDefault();
    document.getElementById('stones')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className="hero container" aria-labelledby="hero-title">
      <div className="hero__inner">
        <div className="hero__text">
          <span className="eyebrow">Jewelry with a little more meaning</span>
          <h1 id="hero-title" className="hero__title">
            Wear Your Stone.
          </h1>
          <p className="hero__body">
            Discover gemstone jewelry inspired by the six Infinity Stones, designed for everyday elegance and personal expression.
          </p>
          <div className="hero__actions">
            <Button to="/shop" size="lg" iconRight={ArrowRight}>
              Shop Collection
            </Button>
            <Button href="#stones" variant="outline" size="lg" onClick={scrollToStones}>
              Explore the Stones
            </Button>
          </div>
          <span className="diamonds hero__diamonds" aria-hidden="true">
            {DIAMOND_STYLES.map((style, i) => (
              <span key={i} style={style} />
            ))}
          </span>
        </div>
        <div className="hero__media">
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

function FeaturedCollections() {
  const [collections, setCollections] = useState(null);

  useEffect(() => {
    let active = true;
    getCollections().then((data) => active && setCollections(data));
    return () => {
      active = false;
    };
  }, []);

  return (
    <section id="stones" className="section container home-stones" aria-labelledby="stones-title">
      <div className="section-head">
        <div>
          <span className="section-eyebrow">Find your color. Find your meaning.</span>
          <h2 id="stones-title" className="section-title">
            Six stones. Endless expression.
          </h2>
        </div>
        <Link to="/collections" className="text-link text-link--ink home-underlined">
          Explore all collections <ArrowRight size={16} strokeWidth={1.5} />
        </Link>
      </div>
      <div className="collection-grid">
        {collections
          ? collections.map((c) => <CollectionCard key={c.id} collection={c} />)
          : Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={300} />)}
      </div>
    </section>
  );
}

function FeaturedProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getFeaturedProducts(8).then((data) => {
      if (!active) return;
      setProducts(data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="section container" aria-labelledby="featured-title">
      <div className="section-head">
        <div>
          <span className="section-eyebrow">Your next everyday favorite</span>
          <h2 id="featured-title" className="section-title">
            The pieces you&apos;ll reach for.
          </h2>
        </div>
        <Link to="/shop" className="text-link text-link--ink">
          View all <ArrowRight size={16} strokeWidth={1.5} />
        </Link>
      </div>
      <ProductGrid products={products} loading={loading} skeletonCount={8} />
    </section>
  );
}

function PackagesTeaser() {
  const [signature, setSignature] = useState(null);

  useEffect(() => {
    let active = true;
    getPackages().then((list) => active && setSignature(list.find((p) => p.signature)));
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="container" aria-labelledby="packages-teaser-title">
      <div className="packages-teaser">
        <div className="packages-teaser__text">
          <span className="eyebrow">Signature package</span>
          <h2 id="packages-teaser-title" className="packages-teaser__title">
            Gift the full spectrum.
          </h2>
          <p className="muted">
            {signature
              ? `The ${signature.name}: ${signature.includes}, from ${formatPriceShort(signature.priceMin)}.`
              : 'Six pieces representing the six stones, presented in a premium jewelry box.'}
          </p>
        </div>
        <div className="packages-teaser__actions">
          <Button to="/collections#packages" iconRight={ArrowRight}>
            View packages
          </Button>
        </div>
      </div>
    </section>
  );
}

function BrandPromise() {
  return (
    <section className="section container" aria-labelledby="promise-title">
      <h2 id="promise-title" className="visually-hidden">
        Our promise
      </h2>
      <ul className="promise-row" role="list">
        {PROMISES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="promise">
            <Icon size={28} strokeWidth={1.1} className="promise__icon" aria-hidden="true" />
            <h3 className="promise__title">{title}</h3>
            <p className="promise__text">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Newsletter() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const { showToast } = useToast();

  function handleSubmit(e) {
    e.preventDefault();
    const message = validateEmail(email);
    setError(message);
    if (message) return;
    // Frontend only: no email is stored or sent.
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setEmail('');
      showToast("You're on the list. Welcome to Avengems.", { type: 'success' });
    }, 600);
  }

  return (
    <section className="newsletter" aria-labelledby="newsletter-title">
      <div className="container newsletter__inner">
        <div>
          <h2 id="newsletter-title" className="newsletter__title">
            Letters from Avengems
          </h2>
          <p className="muted">New stones, styling notes, and early access to drops. No spam, ever.</p>
        </div>
        <form className="newsletter__form" onSubmit={handleSubmit} noValidate>
          <Input
            label="Email address"
            type="email"
            icon={Mail}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError('');
            }}
            error={error}
            autoComplete="email"
          />
          <Button type="submit" loading={sending}>
            Subscribe
          </Button>
        </form>
      </div>
    </section>
  );
}

export default function Home() {
  useDocumentTitle(null);
  return (
    <div className="home">
      <Hero />
      <FeaturedCollections />
      <FeaturedProducts />
      <PackagesTeaser />
      <BrandPromise />
      <Newsletter />
    </div>
  );
}
