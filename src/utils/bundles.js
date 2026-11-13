import { STONE_ORDER } from './stoneTheme';

/** Cheapest and dearest in-stock piece, for packages priced per piece (liveRange). Null if nothing is in stock. */
export function catalogPriceRange(products = []) {
  const prices = products.filter((p) => p.stock > 0).map((p) => p.price);
  return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
}

/**
 * Lowest possible total for a buildable package, using in-stock pieces at their default size.
 * 'any': the cheapest `pieces` products; 'one-per-stone': the cheapest piece of each stone.
 * Returns null when the package isn't buildable or there isn't enough stock to complete it.
 */
export function bundleFromPrice(pkg, products = []) {
  const inStock = products.filter((p) => p.stock > 0);
  if (pkg.build === 'any') {
    const prices = inStock.map((p) => p.price).sort((a, b) => a - b);
    return prices.length >= pkg.pieces ? prices.slice(0, pkg.pieces).reduce((sum, price) => sum + price, 0) : null;
  }
  if (pkg.build === 'one-per-stone') {
    let total = 0;
    for (const stone of STONE_ORDER) {
      const prices = inStock.filter((p) => p.stone === stone).map((p) => p.price);
      if (!prices.length) return null;
      total += Math.min(...prices);
    }
    return total;
  }
  return null;
}
