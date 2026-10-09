import ProductCard from './ProductCard';
import { ProductGridSkeleton } from '../ui/Skeleton';
import './ProductCard.css';

export default function ProductGrid({ products, loading = false, skeletonCount = 8, columns = 4, empty = null }) {
  if (loading) return <ProductGridSkeleton count={skeletonCount} />;
  if (!products?.length) return empty;
  return (
    <div className={`product-grid ${columns === 3 ? 'product-grid--3' : ''}`}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
