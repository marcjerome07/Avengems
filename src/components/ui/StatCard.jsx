/** Small KPI tile. `accent` is any CSS color for the left rule. */
export default function StatCard({ label, value, hint, icon: Icon, accent }) {
  return (
    <div className="stat-card" style={accent ? { '--accent': accent } : undefined}>
      <p className="stat-card__label">
        {label}
        {Icon && <Icon size={18} strokeWidth={1.4} aria-hidden="true" />}
      </p>
      <p className="stat-card__value">{value}</p>
      {hint && <p className="stat-card__hint">{hint}</p>}
    </div>
  );
}
