import PageContainer from '../layout/PageContainer';
import { DIAMOND_STYLES } from '../../utils/stoneTheme';
import './Auth.css';

/** Centered card layout shared by every auth page. */
export default function AuthShell({ title, subtitle, docTitle, children, footer, aside }) {
  return (
    <PageContainer title={docTitle ?? title} className="auth-page">
      <div className={`auth-wrap ${aside ? 'auth-wrap--split' : ''}`}>
        <div className="auth-card">
          <span className="diamonds diamonds--sm auth-card__diamonds" aria-hidden="true">
            {DIAMOND_STYLES.map((style, i) => (
              <span key={i} style={style} />
            ))}
          </span>
          <h1 className="auth-card__title">{title}</h1>
          {subtitle && <p className="auth-card__subtitle">{subtitle}</p>}
          <div className="auth-card__body">{children}</div>
          {footer && <div className="auth-card__footer">{footer}</div>}
        </div>
        {aside && <div className="auth-aside">{aside}</div>}
      </div>
    </PageContainer>
  );
}

/** Inline alert used for form-level errors and notices. */
export function FormAlert({ type = 'error', children, icon: Icon }) {
  return (
    <div className={`form-alert form-alert--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      {Icon && <Icon size={18} strokeWidth={1.6} aria-hidden="true" />}
      <div>{children}</div>
    </div>
  );
}
