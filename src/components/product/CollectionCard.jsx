import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Gem, GemDefs } from './GemVisual';
import './CollectionCard.css';

/** Small standalone gem icon for collection cards and headers. */
export function StoneGem({ stone, size = 80 }) {
  const uid = `sg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="stone-gem">
      <defs>
        <GemDefs uid={uid} />
      </defs>
      <Gem stone={stone} cut="rhombus" cx={50} cy={46} r={38} uid={uid} />
    </svg>
  );
}

export default function CollectionCard({ collection, showDescription = true }) {
  return (
    <article className="collection-card">
      <Link to={`/collections/${collection.slug}`} className="collection-card__link">
        <StoneGem stone={collection.stone} />
        <h3 className="collection-card__title">{collection.color}</h3>
        <p className="collection-card__tagline">{collection.tagline}</p>
        {showDescription && (
          <>
            <p className="collection-card__stone">
              {collection.stoneName} · {collection.gemstone.replace(' (synthetic)', '')}
            </p>
            <p className="collection-card__desc">{collection.description}</p>
          </>
        )}
        <span className="collection-card__cta">
          View Collection <ArrowRight size={15} strokeWidth={1.5} />
        </span>
      </Link>
    </article>
  );
}
