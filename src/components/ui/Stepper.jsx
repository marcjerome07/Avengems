import { Check } from 'lucide-react';
import './Stepper.css';

/** steps: ['Information', ...]; completed steps can be clicked to go back. */
export default function Stepper({ steps, current, onStepClick }) {
  return (
    <nav aria-label="Checkout progress">
      <ol className="stepper" role="list">
        {steps.map((label, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'upcoming';
          const clickable = state === 'done' && onStepClick;
          const inner = (
            <>
              <span className="stepper__dot" aria-hidden="true">
                {state === 'done' ? <Check size={14} strokeWidth={2} /> : i + 1}
              </span>
              <span className="stepper__label">{label}</span>
            </>
          );
          return (
            <li key={label} className={`stepper__step is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              {clickable ? (
                <button type="button" className="stepper__btn" onClick={() => onStepClick(i)}>
                  {inner}
                  <span className="visually-hidden"> (completed, edit)</span>
                </button>
              ) : (
                <span className="stepper__btn">{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
