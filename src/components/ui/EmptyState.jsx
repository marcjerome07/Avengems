import './EmptyState.css';

/** headingLevel=1 when the empty state is the whole page (e.g. Product unavailable). */
export default function EmptyState({ icon: Icon, title, message, children, compact = false, headingLevel = 2 }) {
  const Heading = `h${headingLevel}`;
  return (
    <div className={`empty-state ${compact ? 'empty-state--compact' : ''}`}>
      {Icon && (
        <span className="empty-state__icon" aria-hidden="true">
          <Icon size={28} strokeWidth={1.3} />
        </span>
      )}
      <Heading className="empty-state__title">{title}</Heading>
      {message && <p className="empty-state__message">{message}</p>}
      {children && <div className="empty-state__actions">{children}</div>}
    </div>
  );
}
