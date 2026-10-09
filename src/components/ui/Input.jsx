import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './Field.css';

/**
 * Labeled text input with inline error + hint.
 * `revealable` adds a show/hide toggle for password fields.
 */
const Input = forwardRef(function Input(
  {
    label,
    error,
    hint,
    id,
    type = 'text',
    revealable = false,
    icon: Icon,
    className = '',
    optional,
    'aria-describedby': extraDescribedBy,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? `in${autoId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [revealed, setRevealed] = useState(false);
  const describedBy = [error ? `${inputId}-error` : '', hint ? `${inputId}-hint` : '', extraDescribedBy].filter(Boolean).join(' ');
  const actualType = revealable ? (revealed ? 'text' : 'password') : type;

  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label className="field__label" htmlFor={inputId}>
          {label}
          {optional && <span className="field__optional"> (optional)</span>}
        </label>
      )}
      <div className={`field__control ${Icon ? 'has-icon' : ''} ${revealable ? 'has-toggle' : ''}`}>
        {Icon && <Icon className="field__icon" size={18} strokeWidth={1.6} aria-hidden="true" />}
        <input
          ref={ref}
          id={inputId}
          type={actualType}
          className="field__input"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy || undefined}
          {...rest}
        />
        {revealable && (
          <button
            type="button"
            className="field__toggle"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
          >
            {revealed ? <EyeOff size={18} strokeWidth={1.6} /> : <Eye size={18} strokeWidth={1.6} />}
          </button>
        )}
      </div>
      {hint && !error && (
        <p className="field__hint" id={`${inputId}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${inputId}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

export default Input;
