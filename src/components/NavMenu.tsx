import { Link, useLocation } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { useState } from 'react';
import '../styles/NavMenu.css';

const NAV_ITEMS = [
  { path: '/', label: '🏠 Home' },
  { path: '/settings', label: '⚙️ Settings' },
  { path: '/chat', label: '💬 Chat' },
  { path: '/clock', label: '🕐 Clock' },
  { path: '/bar', label: '📊 Bar' },
  { path: '/demo', label: '🧪 Demo' },
];

export default function NavMenu() {
  const { settings } = useSettings();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const token = settings.overlayToken;

  function buildTo(path: string) {
    return token ? `${path}?token=${encodeURIComponent(token)}` : path;
  }

  return (
    <nav className={`nav-menu ${open ? 'open' : ''}`}>
      <button className="nav-toggle" onClick={() => setOpen(!open)} aria-label="Toggle navigation">
        ☰
      </button>
      {open && (
        <div className="nav-links">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={buildTo(item.path)}
              className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
