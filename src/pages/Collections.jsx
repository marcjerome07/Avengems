import { useEffect, useState } from 'react';
import PageContainer, { PageHeader } from '../components/layout/PageContainer';
import CollectionCard from '../components/product/CollectionCard';
import PackageCard from '../components/product/PackageCard';
import Skeleton from '../components/ui/Skeleton';
import { getCollections, getPackages } from '../services/productService';
import { DIAMOND_STYLES } from '../utils/stoneTheme';
import './Collections.css';

export default function Collections() {
  const [collections, setCollections] = useState(null);
  const [packages, setPackages] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([getCollections(), getPackages()]).then(([c, p]) => {
      if (!active) return;
      setCollections(c);
      setPackages(p);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PageContainer title="Collections">
      <section className="collections-hero">
        <PageHeader
          eyebrow="The six stones"
          title="Find the stone that feels like you."
          subtitle="Six gemstone colors, each with its own meaning. Every collection includes a ring, a necklace, a bracelet, and a pair of earrings."
          align="center"
        />
        <span className="diamonds" aria-hidden="true">
          {DIAMOND_STYLES.map((style, i) => (
            <span key={i} style={style} />
          ))}
        </span>
      </section>

      <section aria-label="Stone collections" className="collections-list">
        <div className="collection-grid collection-grid--3">
          {collections
            ? collections.map((c) => <CollectionCard key={c.id} collection={c} />)
            : Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={360} />)}
        </div>
      </section>

      <section id="packages" className="packages-section" aria-labelledby="packages-title">
        <div className="section-head">
          <div>
            <span className="section-eyebrow">Bundles &amp; gifts</span>
            <h2 id="packages-title" className="section-title">
              Packages
            </h2>
          </div>
          <p className="packages-section__intro">Mix any stones you like. Bigger sets come in premium packaging, ready to give.</p>
        </div>
        <div className="package-grid">
          {packages
            ? packages.map((p) => <PackageCard key={p.id} pkg={p} />)
            : Array.from({ length: 5 }, (_, i) => <Skeleton key={i} height={320} />)}
        </div>
        <p className="packages-section__note">
          Customized Piece: base price + ₱100–₱300 for available size or gemstone-color customization. Package pricing is informational in
          this demo.
        </p>
      </section>
    </PageContainer>
  );
}
