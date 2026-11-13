/**
 * Small KPI tile. `accent` is any CSS color (usually a stone color): it tints the icon badge,
 * the corner gem and the card's soft wash. `highlight` is an optional short emphasized line
 * (e.g. "₱869 in the last 7 days") shown between the value and the hint.
 */
export default function StatCard({ label, value, hint, highlight, icon: Icon, accent }) {
  return (
    <div className="stat-card" style={accent ? { '--accent': accent } : undefined}>
      <p className="stat-card__label">
        {label}
        {Icon && (
          <span className="stat-card__icon" aria-hidden="true">
            <Icon size={18} strokeWidth={1.5} />
          </span>
        )}
      </p>
      <p className="stat-card__value">{value}</p>
      {highlight && <p className="stat-card__highlight">{highlight}</p>}
      {hint && <p className="stat-card__hint">{hint}</p>}
    </div>
  );
}
