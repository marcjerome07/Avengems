import { Check, Circle } from 'lucide-react';
import { PASSWORD_RULES } from '../../utils/validators';
import './Auth.css';

export default function PasswordChecklist({ password, id }) {
  return (
    <ul className="pw-checklist" id={id} aria-label="Password requirements" role="list">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li key={rule.id} className={met ? 'is-met' : ''}>
            {met ? <Check size={14} strokeWidth={2.2} aria-hidden="true" /> : <Circle size={10} strokeWidth={1.6} aria-hidden="true" />}
            <span>{rule.label}</span>
            <span className="visually-hidden">{met ? ' (met)' : ' (not met)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
