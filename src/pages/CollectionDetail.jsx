import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Compass } from 'lucide-react';
import PageContainer from '../components/layout/PageContainer';
import ProductGrid from '../components/product/ProductGrid';
import { StoneGem } from '../components/product/CollectionCard';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import { getCollectionBySlug } from '../services/productService';
import { STONE_ORDER, stoneTheme } from '../utils/stoneTheme';
import './Collections.css';

export default function CollectionDetail() {
  const { slug } = useParams();
  const [result, setResult] = useState({ slug: null, status: 'loading' });
  const state = result.slug === slug ? result : { status: 'loading' };

  useEffect(() => {
    let active = true;
    getCollectionBySlug(slug)
      .then((data) => active && setResult({ slug, status: 'ready', ...data }))
      .catch(() => active && setResult({ slug, status: 'missing' }));
    return () => {
      active = false;
    };
  }, [slug]);

  if (state.status === 'missing') {
    return (
      <PageContainer title="Collection not found">
        <EmptyState
          headingLevel={1}
          icon={Compass}
          title="Collection not found"
          message="That stone isn't part of our collection. Explore all six stones instead."
        >
          <Button to="/collections">View all collections</Button>
        </EmptyState>
      </PageContainer>
    );
  }

  const { collection, products } = state;

  return (
    <PageContainer title={collection ? `${collection.stoneName} Collection` : 'Collection'}>
      <nav aria-label="Breadcrumb">
        <ol className="breadcrumbs">
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/collections">Collections</Link>
          </li>
          <li aria-current="page">{collection?.color ?? stoneTheme(slug).color}</li>
        </ol>
      </nav>

      {collection ? (
        <header className="collection-hero">
          <div className="collection-hero__gem">
            <StoneGem stone={collection.stone} size={140} />
          </div>
          <div className="collection-hero__text">
            <span className="eyebrow">{collection.stoneName}</span>
            <h1 className="collection-hero__title">
              {collection.color} · {collection.tagline}
            </h1>
            <p className="collection-hero__desc">{collection.description}</p>
            <p className="collection-hero__facts">
              <span>Gemstone</span> {collection.gemstone}
              <span>Pieces</span> {products.length}
            </p>
          </div>
        </header>
      ) : (
        <Skeleton height={240} style={{ marginBottom: 48 }} />
      )}

      <ProductGrid products={products ?? []} loading={state.status === 'loading'} skeletonCount={4} />

      <section className="other-stones" aria-labelledby="other-stones-title">
        <h2 id="other-stones-title" className="section-title">
          Explore other stones
        </h2>
        <div className="other-stones__list">
          {STONE_ORDER.filter((s) => s !== slug).map((s) => (
            <Link key={s} to={`/collections/${s}`} className="pill">
              <span className="stone-dot" style={{ background: stoneTheme(s).base }} aria-hidden="true" />
              {stoneTheme(s).color}
            </Link>
          ))}
        </div>
      </section>
    </PageContainer>
  );
}
