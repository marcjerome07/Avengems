import { useId } from 'react';
import { stoneTheme, STONE_ORDER } from '../../utils/stoneTheme';
import './GemVisual.css';

/* ------------------------------------------------------------------
   Geometry helpers for faceted gems
------------------------------------------------------------------- */

const DEG = Math.PI / 180;
const LIGHT_ANGLE = -135 * DEG; // light from the upper-left

function outline(cut, cx, cy, r) {
  switch (cut) {
    case 'rhombus':
      return [
        [cx, cy - r],
        [cx + r * 0.78, cy],
        [cx, cy + r],
        [cx - r * 0.78, cy],
      ];
    case 'octagon':
      return Array.from({ length: 8 }, (_, k) => {
        const a = (22.5 + 45 * k - 90) * DEG;
        return [cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r];
      });
    case 'pear': {
      const pts = [[cx, cy - r * 1.32]];
      const ccy = cy + r * 0.14;
      for (let i = 0; i <= 8; i += 1) {
        const a = (-38 + (256 / 8) * i) * DEG;
        pts.push([cx + Math.cos(a) * r * 0.84, ccy + Math.sin(a) * r * 0.84]);
      }
      return pts;
    }
    case 'round':
    default:
      return Array.from({ length: 10 }, (_, k) => {
        const a = (-90 + 36 * k) * DEG;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      });
  }
}

const toPoints = (pts) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** A faceted gemstone with highlight and sparkle. Exported for hero/collection art. */
export function Gem({ stone = 'power', cut = 'round', cx, cy, r, uid, sparkle = true }) {
  const t = stoneTheme(stone);
  const outer = outline(cut, cx, cy, r);
  const tcx = cx - r * 0.04;
  const tcy = cy - r * 0.08;
  const inner = outer.map(([x, y]) => [tcx + (x - cx) * 0.5, tcy + (y - cy) * 0.5]);

  const facets = outer.map((p, i) => {
    const next = (i + 1) % outer.length;
    const mx = (p[0] + outer[next][0]) / 2;
    const my = (p[1] + outer[next][1]) / 2;
    const shade = Math.cos(Math.atan2(my - cy, mx - cx) - LIGHT_ANGLE);
    const fill = shade > 0.45 ? t.light : shade < -0.35 ? t.dark : t.base;
    return { pts: [p, outer[next], inner[next], inner[i]], fill };
  });

  return (
    <g className="gem">
      <ellipse cx={cx} cy={cy + r * 1.05} rx={r * 0.9} ry={r * 0.16} fill={t.dark} opacity="0.16" filter={`url(#${uid}-blur)`} />
      <polygon points={toPoints(outer)} fill={t.base} />
      {facets.map((f, i) => (
        <polygon key={i} points={toPoints(f.pts)} fill={f.fill} stroke="rgba(255,255,255,0.32)" strokeWidth="0.8" strokeLinejoin="round" />
      ))}
      <polygon points={toPoints(inner)} fill={`url(#${uid}-table-${stone})`} stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />
      {/* soft white highlight facet */}
      <polygon points={toPoints([inner[inner.length - 1], inner[0], [tcx - r * 0.05, tcy - r * 0.05]])} fill="#fff" opacity="0.5" />
      <polygon points={toPoints(outer)} fill={`url(#${uid}-sheen)`} />
      {sparkle && (
        <path
          d={`M ${cx + r * 0.5} ${cy - r * 0.78} l ${r * 0.06} ${r * 0.2} l ${r * 0.2} ${r * 0.06} l ${-r * 0.2} ${r * 0.06} l ${-r * 0.06} ${r * 0.2} l ${-r * 0.06} ${-r * 0.2} l ${-r * 0.2} ${-r * 0.06} l ${r * 0.2} ${-r * 0.06} Z`}
          fill="#fff"
          opacity="0.9"
        />
      )}
    </g>
  );
}

/** Shared <defs> for gems: blur filter, sheen, and a table gradient per stone. */
export function GemDefs({ uid }) {
  return (
    <>
      <filter id={`${uid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" />
      </filter>
      <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.08" />
      </linearGradient>
      {STONE_ORDER.map((s) => {
        const t = stoneTheme(s);
        return (
          <linearGradient key={s} id={`${uid}-table-${s}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={t.light} />
            <stop offset="0.6" stopColor={t.base} />
            <stop offset="1" stopColor={t.dark} />
          </linearGradient>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------
   Metal tones
------------------------------------------------------------------- */

const METALS = {
  '925 Sterling Silver': ['#FDFDFE', '#D2D3D8', '#999BA3'],
  'Stainless Steel': ['#F0F1F3', '#B8BCC2', '#7E838A'],
  champagne: ['#F7E9CC', '#D8BD8C', '#A68551'],
};

function MetalDefs({ uid, material }) {
  const [hi, mid, lo] = METALS[material] ?? METALS['925 Sterling Silver'];
  return (
    <>
      <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={hi} />
        <stop offset="0.5" stopColor={mid} />
        <stop offset="1" stopColor={lo} />
      </linearGradient>
      <linearGradient id={`${uid}-metal-back`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={lo} />
        <stop offset="1" stopColor={mid} />
      </linearGradient>
    </>
  );
}

/* ------------------------------------------------------------------
   Jewelry silhouettes (400 x 500 canvas)
------------------------------------------------------------------- */

function Ring({ uid, stone }) {
  return (
    <g>
      {/* back of band */}
      <path d="M 108 318 A 92 36 0 0 1 292 318" fill="none" stroke={`url(#${uid}-metal-back)`} strokeWidth="9" strokeLinecap="round" />
      {/* front of band */}
      <path d="M 108 318 A 92 36 0 0 0 292 318" fill="none" stroke={`url(#${uid}-metal)`} strokeWidth="15" strokeLinecap="round" />
      <path d="M 120 330 A 84 28 0 0 0 280 330" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" />
      {/* setting / prongs */}
      <path d="M 168 292 L 178 262 L 222 262 L 232 292 Z" fill={`url(#${uid}-metal)`} />
      <path
        d="M 172 268 L 162 232 M 228 268 L 238 232 M 200 262 L 200 226"
        stroke={`url(#${uid}-metal)`}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <Gem stone={stone} cut="round" cx={200} cy={226} r={46} uid={uid} />
    </g>
  );
}

function Necklace({ uid, stone }) {
  return (
    <g>
      <path
        d="M 58 -10 Q 96 214 200 228 Q 304 214 342 -10"
        fill="none"
        stroke={`url(#${uid}-metal)`}
        strokeWidth="3.2"
        strokeDasharray="7 3.5"
        strokeLinecap="round"
      />
      <path
        d="M 58 -10 Q 96 214 200 228 Q 304 214 342 -10"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.5"
        strokeWidth="1"
        strokeDasharray="2 8.5"
      />
      <circle cx="200" cy="240" r="10" fill="none" stroke={`url(#${uid}-metal)`} strokeWidth="4.5" />
      <polygon points={toPoints(outline('octagon', 200, 320, 66))} fill={`url(#${uid}-metal)`} />
      <Gem stone={stone} cut="octagon" cx={200} cy={320} r={58} uid={uid} />
    </g>
  );
}

function Bracelet({ uid, stone }) {
  const gems = [
    { a: 90, r: 30 },
    { a: 128, r: 18 },
    { a: 52, r: 18 },
  ];
  return (
    <g>
      <path
        d="M 70 292 A 130 60 0 0 1 330 292"
        fill="none"
        stroke={`url(#${uid}-metal-back)`}
        strokeWidth="3"
        strokeDasharray="6 4"
        strokeLinecap="round"
      />
      <path
        d="M 70 292 A 130 60 0 0 0 330 292"
        fill="none"
        stroke={`url(#${uid}-metal)`}
        strokeWidth="4.5"
        strokeDasharray="8 3.5"
        strokeLinecap="round"
      />
      <path d="M 82 300 A 120 52 0 0 0 318 300" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="2 9" />
      <circle cx="200" cy="232" r="7" fill="none" stroke={`url(#${uid}-metal-back)`} strokeWidth="3" />
      {gems.map(({ a, r }) => {
        const x = 200 + Math.cos(a * DEG) * 130;
        const y = 292 + Math.sin(a * DEG) * 60;
        return (
          <g key={a}>
            <polygon points={toPoints(outline('rhombus', x, y, r + 6))} fill={`url(#${uid}-metal)`} />
            <Gem stone={stone} cut="rhombus" cx={x} cy={y} r={r} uid={uid} sparkle={r > 20} />
          </g>
        );
      })}
    </g>
  );
}

function Earring({ uid, stone, x, y, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        d="M -16 -112 Q -18 -152 2 -152 Q 22 -152 18 -122 L 0 -84"
        fill="none"
        stroke={`url(#${uid}-metal)`}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="0" cy="-74" r="8" fill="none" stroke={`url(#${uid}-metal)`} strokeWidth="3.5" />
      <polygon points={toPoints(outline('pear', 0, 0, 52))} fill={`url(#${uid}-metal)`} />
      <Gem stone={stone} cut="pear" cx={0} cy={2} r={45} uid={uid} />
    </g>
  );
}

function Earrings({ uid, stone }) {
  return (
    <g>
      <Earring uid={uid} stone={stone} x={252} y={292} scale={0.9} />
      <Earring uid={uid} stone={stone} x={148} y={276} />
    </g>
  );
}

const PIECES = { Ring, Necklace, Bracelet, Earrings };

/* Deterministic specks so each product looks the same on every render */
function specks(seed) {
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: 14 }, () => ({ x: rand() * 400, y: rand() * 500, r: 0.6 + rand() * 1.6, o: 0.25 + rand() * 0.5 }));
}

const VARIANT_TRANSFORMS = [
  '',
  'translate(200 260) scale(1.35) translate(-200 -250)',
  'rotate(-12 200 270)',
  'translate(200 270) scale(0.82) translate(-200 -270)',
];

const VARIANT_BACKGROUNDS = [
  ['#F7F2EA', '#EAE1D3'],
  ['#F4EEE5', '#E6DCCB'],
  ['#F2ECE4', '#E2D8C8'],
  ['#EFE8DD', '#DCD0BE'],
];

/**
 * <GemVisual type="Ring" stone="power" material="925 Sterling Silver" variant={0} />
 * Elegant SVG placeholder used whenever a product has no photos.
 */
export default function GemVisual({
  type = 'Ring',
  stone = 'power',
  material = '925 Sterling Silver',
  variant = 0,
  className = '',
  label,
}) {
  const uid = `gv${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const Piece = PIECES[type] ?? Ring;
  const t = stoneTheme(stone);
  const v = variant % VARIANT_TRANSFORMS.length;
  const [bgTop, bgBottom] = VARIANT_BACKGROUNDS[v];
  const dots = specks(STONE_ORDER.indexOf(stone) * 7 + type.length + v * 3 + 1);

  return (
    <svg
      className={`gem-visual ${className}`}
      viewBox="0 0 400 500"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label ?? `${t.color} ${type.toLowerCase()} illustration`}
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={bgTop} />
          <stop offset="1" stopColor={bgBottom} />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="0.5" cy="0.52" r="0.5">
          <stop offset="0" stopColor={t.light} stopOpacity="0.38" />
          <stop offset="1" stopColor={t.light} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-ray`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <GemDefs uid={uid} />
        <MetalDefs uid={uid} material={material} />
      </defs>

      <rect width="400" height="500" fill={`url(#${uid}-bg)`} />
      {/* soft diagonal light, like a window reflection */}
      <rect x="-120" y="40" width="190" height="700" fill={`url(#${uid}-ray)`} transform="rotate(-32 200 250)" opacity="0.7" />
      {/* faint hexagon motif */}
      <polygon
        points={toPoints(
          Array.from({ length: 6 }, (_, k) => [200 + Math.cos((60 * k - 90) * DEG) * 160, 268 + Math.sin((60 * k - 90) * DEG) * 160]),
        )}
        fill="none"
        stroke="#C9BBA4"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      <circle cx="200" cy="268" r="170" fill={`url(#${uid}-glow)`} />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={i % 3 === 0 ? '#B39465' : '#fff'} opacity={d.o} />
      ))}
      <ellipse cx="200" cy="404" rx="120" ry="12" fill="#8C7A62" opacity="0.12" filter={`url(#${uid}-blur)`} />

      <g transform={VARIANT_TRANSFORMS[v]}>
        <Piece uid={uid} stone={stone} />
      </g>
    </svg>
  );
}
