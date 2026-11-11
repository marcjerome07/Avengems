import { Check, Circle } from 'lucide-react';
import { checkPassword } from '../../utils/passwordRules';
import './Auth.css';

/** Strength bar (Weak / Fair / Strong) followed by the live requirements list. */
export default function PasswordChecklist({ password, id }) {
  const { rules, strength } = checkPassword(password);
  return (
    <div className="pw-feedback">
      <div className={`pw-strength is-${strength.level}`}>
        <span className="pw-strength__bars" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= strength.score ? 'is-on' : ''} />
          ))}
        </span>
        <span className="pw-strength__label" aria-live="polite">
          {strength.label ? `Strength: ${strength.label}` : 'Strength'}
        </span>
      </div>
      <ul className="pw-checklist" id={id} aria-label="Password requirements" role="list">
        {rules.map((rule) => (
          <li key={rule.id} className={rule.met ? 'is-met' : ''}>
            {rule.met ? <Check size={14} strokeWidth={2.2} aria-hidden="true" /> : <Circle size={10} strokeWidth={1.6} aria-hidden="true" />}
            <span>{rule.label}</span>
            <span className="visually-hidden">{rule.met ? ' (met)' : ' (not met)'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Live "Passwords match" / "Passwords don't match" line under the confirm field. */
export function PasswordMatch({ password, confirm, id }) {
  if (!confirm) return null;
  const ok = checkPassword(password, confirm).matches;
  return (
    <p id={id} className={`pw-match ${ok ? 'is-ok' : 'is-bad'}`} role="status">
      {ok ? (
        <>
          <Check size={14} strokeWidth={2.2} aria-hidden="true" /> Passwords match
        </>
      ) : (
        'Passwords don’t match'
      )}
    </p>
  );
}
