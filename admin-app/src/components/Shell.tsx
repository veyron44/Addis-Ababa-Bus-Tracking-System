import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearToken } from '../lib/token';
import { t } from '../strings';

const links = [
  { to: '/live',     label: t.live,     icon: '📡' },
  { to: '/vehicles', label: t.vehicles, icon: '🚌' },
  { to: '/drivers',  label: t.drivers,  icon: '👤' },
  { to: '/shifts',   label: t.shifts,   icon: '📋' },
];

export default function Shell() {
  const navigate = useNavigate();

  function handleLogout() {
    clearToken();
    navigate('/login', { replace: true });
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span>●</span> {t.appName}
        </div>
        <nav>
          {links.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span className="sidebar-icon">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button onClick={handleLogout}>{t.logout}</button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
