import { useId } from 'react';
import { Gem, GemDefs } from './GemVisual';
import { STONE_ORDER } from '../../utils/stoneTheme';

/**
 * Large still-life illustration for the home hero: a pendant on a fine chain
 * resting in a beam of light, with the six stones scattered below.
 * Replace with a real photo by swapping this component for an <img>.
 */
export default function HeroVisual() {
  const uid = `hv${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const scattered = [
    { x: 150, y: 560, r: 18 },
    { x: 225, y: 600, r: 14 },
    { x: 300, y: 575, r: 20 },
    { x: 380, y: 610, r: 15 },
    { x: 455, y: 570, r: 19 },
    { x: 520, y: 615, r: 13 },
  ];

  return (
    <svg
      className="hero-visual"
      viewBox="0 0 640 720"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="A gemstone pendant on a fine chain resting in soft light, with six colored stones"
    >
      <defs>
        <radialGradient id={`${uid}-bg`} cx="0.62" cy="0.38" r="0.85">
          <stop offset="0" stopColor="#5A534B" />
          <stop offset="0.55" stopColor="#3A3530" />
          <stop offset="1" stopColor="#22201D" />
        </radialGradient>
        <linearGradient id={`${uid}-beam`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F7E9CC" />
          <stop offset="0.5" stopColor="#D8BD8C" />
          <stop offset="1" stopColor="#9C7B49" />
        </linearGradient>
        <filter id={`${uid}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="28" />
        </filter>
        <GemDefs uid={uid} />
      </defs>

      <rect width="640" height="720" fill={`url(#${uid}-bg)`} />
      {/* window light */}
      <rect
        x="250"
        y="-200"
        width="200"
        height="1200"
        fill={`url(#${uid}-beam)`}
        transform="rotate(38 320 360)"
        filter={`url(#${uid}-soft)`}
      />
      <rect
        x="380"
        y="-200"
        width="70"
        height="1200"
        fill={`url(#${uid}-beam)`}
        transform="rotate(38 320 360)"
        opacity="0.5"
        filter={`url(#${uid}-soft)`}
      />

      {/* stone plinth */}
      <ellipse cx="335" cy="640" rx="300" ry="70" fill="#1C1A17" opacity="0.45" filter={`url(#${uid}-soft)`} />

      {/* chain */}
      <path
        d="M 170 -20 Q 210 300 330 340 Q 450 300 500 -20"
        fill="none"
        stroke={`url(#${uid}-metal)`}
        strokeWidth="3.5"
        strokeDasharray="8 4"
        strokeLinecap="round"
      />
      <path
        d="M 170 -20 Q 210 300 330 340 Q 450 300 500 -20"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.55"
        strokeWidth="1"
        strokeDasharray="2 10"
      />
      <circle cx="330" cy="354" r="12" fill="none" stroke={`url(#${uid}-metal)`} strokeWidth="5" />

      {/* pendant */}
      <g>
        <polygon points="330,366 398,412 398,488 330,534 262,488 262,412" fill={`url(#${uid}-metal)`} />
        <Gem stone="space" cut="octagon" cx={330} cy={450} r={74} uid={uid} />
      </g>

      {/* six stones */}
      {scattered.map((s, i) => (
        <Gem key={STONE_ORDER[i]} stone={STONE_ORDER[i]} cut="rhombus" cx={s.x} cy={s.y} r={s.r} uid={uid} sparkle={s.r > 17} />
      ))}

      {/* star specks */}
      {[
        [90, 120, 1.6],
        [560, 90, 1.2],
        [600, 260, 1.8],
        [70, 420, 1.1],
        [610, 470, 1.4],
        [120, 260, 1],
        [480, 180, 1.1],
      ].map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#EBD488" opacity="0.6" />
      ))}
    </svg>
  );
}
