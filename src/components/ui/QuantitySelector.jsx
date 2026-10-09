import { Minus, Plus } from 'lucide-react';
import './QuantitySelector.css';

export default function QuantitySelector({ value, onChange, min = 1, max = 10, size = 'md', label = 'Quantity', disabled = false }) {
  const clamp = (n) => Math.max(min, Math.min(max, n));
  return (
    <div className={`qty qty--${size}`} role="group" aria-label={label}>
      <button
        type="button"
        className="qty__btn"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
      >
        <Minus size={16} strokeWidth={1.6} />
      </button>
      <output className="qty__value" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className="qty__btn"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
      >
        <Plus size={16} strokeWidth={1.6} />
      </button>
    </div>
  );
}
