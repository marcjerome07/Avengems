import { useState } from 'react';
import GemVisual from './GemVisual';

/**
 * Shows the product photo when `images` has entries, otherwise the GemVisual placeholder.
 * Photos get a --sand placeholder while loading and fall back to GemVisual on error.
 */
export default function ProductMedia({ product, stone, variant = 0, imageIndex = 0, className = '' }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const src = product.images?.[imageIndex];
  const visualStone = stone ?? product.stone;

  if (src && !failed && visualStone === product.stone) {
    return (
      <img
        className={`product-media ${loaded ? 'is-loaded' : ''} ${className}`}
        src={src}
        alt={`${product.name}, ${product.material}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', background: 'var(--sand)' }}
      />
    );
  }

  return (
    <GemVisual
      className={className}
      type={product.type}
      stone={visualStone}
      material={product.material}
      variant={variant}
      label={`${product.name} illustration`}
    />
  );
}
