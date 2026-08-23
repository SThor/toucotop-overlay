import { Link, useLocation } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { useState } from 'react';
import '../styles/NavMenu.css';

const NAV_ITEMS = [
  { path: '/', label: '🏠 Home' },
  { path: '/chat', label: '💬 Chat' },
  { path: '/clock', label: '🕐 Clock' },
  { path: '/bar', label: '📊 Bar' },
  { path: '/border', label: '🖼 Border' },
  { path: '/pause', label: '⏸ Pause' },
  { path: '/alerts', label: '🔔 Alerts' },
  { path: '/demo', label: '🧪 Demo' },
];

const OVERLAY_PATHS = ['/chat', '/clock', '/bar', '/pause', '/alerts', '/border'];

export default function NavMenu() {
  const { settings } = useSettings();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const token = settings.overlayToken;

  if (OVERLAY_PATHS.includes(location.pathname)) return null;

  function buildTo(path: string) {
    return token ? `${path}?token=${encodeURIComponent(token)}` : path;
  }

  return (
    <nav className={`nav-menu ${open ? 'open' : ''}`}>
      <button className="nav-toggle" onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open} aria-controls="nav-links">
        ☰
      </button>
      {open && (
        <div className="nav-links" id="nav-links">
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
