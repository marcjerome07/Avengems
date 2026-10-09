import { useEffect, useRef } from 'react';
import './OtpInput.css';

/**
 * Six-box one-time-code input.
 * - Numbers only, auto-advance, Backspace moves back, arrow keys navigate.
 * - Pasting a code fills every box.
 * `value` is a string of digits; `onChange(nextValue)`.
 */
export default function OtpInput({
  length = 6,
  value = '',
  onChange,
  disabled = false,
  error = false,
  autoFocus = true,
  label = 'Verification code',
}) {
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function focusBox(index) {
    const box = refs.current[Math.max(0, Math.min(length - 1, index))];
    box?.focus();
    box?.select();
  }

  function setDigit(index, digit) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join('').slice(0, length));
  }

  function handleChange(e, index) {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      setDigit(index, '');
      return;
    }
    if (raw.length > 1) {
      // Typed fast or autofill dropped several digits into one box.
      const next = digits.slice();
      raw.split('').forEach((d, i) => {
        if (index + i < length) next[index + i] = d;
      });
      onChange(next.join('').slice(0, length));
      focusBox(index + raw.length);
      return;
    }
    setDigit(index, raw);
    if (index < length - 1) focusBox(index + 1);
  }

  function handleKeyDown(e, index) {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        setDigit(index, '');
      } else if (index > 0) {
        e.preventDefault();
        const next = digits.slice();
        next[index - 1] = '';
        onChange(next.join(''));
        focusBox(index - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusBox(index + 1);
    } else if (e.key.length === 1 && !/\d/.test(e.key) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    focusBox(pasted.length >= length ? length - 1 : pasted.length);
  }

  return (
    <div className={`otp ${error ? 'otp--error' : ''}`} role="group" aria-label={label}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="otp__box"
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={length}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${length}`}
          aria-invalid={error || undefined}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
