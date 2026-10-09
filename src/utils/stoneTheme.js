// Visual theme for the six stones. Hex values mirror the --stone-* tokens in
// tokens.css (needed where CSS variables can't be used, e.g. chart libraries).

export const STONE_ORDER = ['power', 'space', 'reality', 'soul', 'time', 'mind'];

export const STONE_THEME = {
  power: { color: 'Purple', token: 'purple', base: '#9479C2', light: '#C3B0E0', dark: '#6E559C' },
  space: { color: 'Blue', token: 'blue', base: '#5F8FCB', light: '#A3C3E8', dark: '#3F6DA6' },
  reality: { color: 'Red', token: 'red', base: '#B5505E', light: '#DE8E98', dark: '#8E3442' },
  soul: { color: 'Orange', token: 'orange', base: '#E0965C', light: '#F3C49B', dark: '#BC6F35' },
  time: { color: 'Green', token: 'green', base: '#6F927C', light: '#A9C4B1', dark: '#4D6E59' },
  mind: { color: 'Yellow', token: 'yellow', base: '#D2AC45', light: '#EBD488', dark: '#A8842A' },
};

export const STONE_COLORS = STONE_ORDER.map((s) => STONE_THEME[s].color);

const COLOR_TO_STONE = Object.fromEntries(Object.entries(STONE_THEME).map(([stone, t]) => [t.color, stone]));

export function stoneTheme(stone) {
  return STONE_THEME[stone] ?? STONE_THEME.power;
}

export function stoneFromColor(color) {
  return COLOR_TO_STONE[color] ?? 'power';
}

/** CSS variable reference for a stone, e.g. var(--stone-purple-light) */
export function stoneVar(stone, shade = '') {
  const { token } = stoneTheme(stone);
  return `var(--stone-${token}${shade ? `-${shade}` : ''})`;
}

/** Inline styles for the six-diamond brand motif */
export const DIAMOND_STYLES = STONE_ORDER.map((s) => ({ background: STONE_THEME[s].base }));
