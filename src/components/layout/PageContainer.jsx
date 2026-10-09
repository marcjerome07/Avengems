import useDocumentTitle from '../../hooks/useDocumentTitle';
import './PageContainer.css';

/**
 * Standard page wrapper: sets the document title and applies consistent spacing.
 * Pass `narrow` for forms and auth pages.
 */
export default function PageContainer({ title, children, narrow = false, className = '', as: Tag = 'div' }) {
  useDocumentTitle(title);

  return <Tag className={`page container ${narrow ? 'page--narrow' : ''} ${className}`}>{children}</Tag>;
}

/** Page heading block with optional eyebrow and subtitle. */
export function PageHeader({ eyebrow, title, subtitle, children, align = 'left' }) {
  return (
    <header className={`page-header page-header--${align}`}>
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {children && <div className="page-header__actions">{children}</div>}
    </header>
  );
}
