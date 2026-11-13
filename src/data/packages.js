// Gift and bundle packages.
// `build` makes a package buyable on /bundle/:id: 'any' = pick any `pieces` products,
// 'one-per-stone' = pick one product for each of the six stones.
// A bundle costs the sum of the pieces chosen (the server prices every item as usual).
const BUNDLE_PRICE = 'Total of the pieces you choose';

export const packages = [
  {
    id: 'pkg-single',
    name: 'Single Piece',
    includes: '1 Avengems jewelry piece + branded pouch',
    // Fallback when the catalog can't load; otherwise the live in-stock range is shown (liveRange).
    priceMin: 299,
    priceMax: 799,
    liveRange: true,
    pieces: 1,
    signature: false,
    shopLink: '/shop',
  },
  {
    id: 'pkg-duo',
    name: 'Infinity Duo',
    includes: 'Any 2 pieces + branded jewelry box',
    priceLabel: BUNDLE_PRICE,
    priceMin: null,
    priceMax: null,
    pieces: 2,
    signature: false,
    build: 'any',
    shopLink: '/bundle/pkg-duo',
  },
  {
    id: 'pkg-trio',
    name: 'Infinity Trio',
    includes: 'Any 3 pieces + premium packaging',
    priceLabel: BUNDLE_PRICE,
    priceMin: null,
    priceMax: null,
    pieces: 3,
    signature: false,
    build: 'any',
    shopLink: '/bundle/pkg-trio',
  },
  {
    id: 'pkg-complete',
    name: 'Complete Infinity Collection',
    includes: '6 pieces representing the six stones + premium jewelry box',
    priceLabel: BUNDLE_PRICE,
    priceMin: null,
    priceMax: null,
    pieces: 6,
    signature: true,
    build: 'one-per-stone',
    shopLink: '/bundle/pkg-complete',
  },
  {
    id: 'pkg-custom',
    name: 'Customized Piece',
    includes: 'Selected piece with size or gemstone-color customization',
    priceLabel: 'Base price + ₱100–₱300 fee',
    priceMin: null,
    priceMax: null,
    pieces: 1,
    signature: false,
    shopLink: '/shop?customizable=1',
  },
];
