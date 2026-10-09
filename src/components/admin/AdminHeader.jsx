/** Shared page header for admin pages. */
export default function AdminHeader({ title, subtitle, children }) {
  return (
    <header className="admin-header">
      <div>
        <h1 className="admin-header__title">{title}</h1>
        {subtitle && <p className="admin-header__subtitle">{subtitle}</p>}
      </div>
      {children && <div className="admin-header__actions">{children}</div>}
    </header>
  );
}
