import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import './Field.css';

/** Labeled native select. options: [{ value, label }] */
export default function Select({ label, error, options = [], id, className = '', hideLabel = false, ...rest }) {
  const autoId = useId();
  const selectId = id ?? `sel${autoId.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label className={`field__label ${hideLabel ? 'visually-hidden' : ''}`} htmlFor={selectId}>
          {label}
        </label>
      )}
      <div className="field__control field__control--select">
        <select
          id={selectId}
          className="field__input field__select"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${selectId}-error` : undefined}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="field__chevron" size={18} strokeWidth={1.6} aria-hidden="true" />
      </div>
      {error && (
        <p className="field__error" id={`${selectId}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
