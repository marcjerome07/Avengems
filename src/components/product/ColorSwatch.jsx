import { Check } from 'lucide-react';
import { stoneTheme } from '../../utils/stoneTheme';
import './ColorSwatch.css';

/**
 * Round gemstone swatch. Renders a button when `onClick` is passed.
 * Uses aria-pressed for toggle groups (filters) or role=radio inside a radiogroup.
 */
export default function ColorSwatch({ stone, selected = false, onClick, size = 'md', showLabel = false, role, disabled = false }) {
  const t = stoneTheme(stone);
  const style = { background: `linear-gradient(135deg, ${t.light} 0%, ${t.base} 55%, ${t.dark} 100%)` };
  const dot = (
    <span className={`swatch swatch--${size} ${selected ? 'is-selected' : ''}`} style={style} aria-hidden={onClick ? 'true' : undefined}>
      {selected && <Check size={size === 'sm' ? 12 : 16} strokeWidth={2.4} />}
    </span>
  );

  if (!onClick) {
    return (
      <span className="swatch-wrap" title={t.color}>
        {dot}
        {showLabel && <span className="swatch-wrap__label">{t.color}</span>}
      </span>
    );
  }

  const ariaProps = role === 'radio' ? { role: 'radio', 'aria-checked': selected } : { 'aria-pressed': selected };

  return (
    <button
      type="button"
      className={`swatch-wrap swatch-btn ${selected ? 'is-selected' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={t.color}
      title={t.color}
      {...ariaProps}
    >
      {dot}
      {showLabel && <span className="swatch-wrap__label">{t.color}</span>}
    </button>
  );
}
