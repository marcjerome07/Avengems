import { Link } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import './Button.css';

/**
 * Button
 * variant: primary | outline | ghost | light | danger
 * size: sm | md | lg
 * Pass `to` to render a router Link, or `href` for a plain anchor.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon: Icon,
  iconRight: IconRight,
  to,
  href,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, fullWidth ? 'btn--full' : '', loading ? 'is-loading' : '', className]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {loading ? (
        <LoaderCircle className="btn__icon spin" size={18} aria-hidden="true" />
      ) : (
        Icon && <Icon className="btn__icon" size={18} strokeWidth={1.6} aria-hidden="true" />
      )}
      {children && <span>{children}</span>}
      {IconRight && !loading && <IconRight className="btn__icon btn__icon--right" size={18} strokeWidth={1.6} aria-hidden="true" />}
    </>
  );

  if (to && !disabled) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  if (href && !disabled) {
    return (
      <a href={href} className={classes} {...rest}>
        {content}
      </a>
    );
  }

  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
}
