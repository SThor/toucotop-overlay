import { useSettings } from '../contexts/SettingsContext';
import { Navigate } from 'react-router-dom';
import '../styles/ServerPages.css';

export default function LandingPage() {
  const { settings } = useSettings();

  if (settings.overlayToken) {
    return <Navigate to={`/auth/success?token=${encodeURIComponent(settings.overlayToken)}`} replace />;
  }

  return (
    <div className="server-page">
      <div className="container">
        <div className="icon-code">🔐</div>
        <h1 className="page-title">Toucotop Stream Overlay</h1>
        <p className="page-message">
          Welcome! You need to authenticate with Twitch to access your overlay system.
        </p>

        <div className="details-section">
          <h3>What you'll get:</h3>
          <ul>
            <li>Real-time chat overlay for OBS</li>
            <li>Clock overlay component</li>
            <li>Progress bar overlay component</li>
            <li>Secure token-based access for streaming</li>
          </ul>
        </div>

        <a href="/auth/twitch" className="action-btn">🚀 Authenticate with Twitch</a>
      </div>
    </div>
  );
}
