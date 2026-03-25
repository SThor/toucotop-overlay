import { useSearchParams } from 'react-router-dom';
import { CopyButton } from '../components/CopyButton';
import '../styles/ServerPages.css';

function formatExpiryDate(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export default function AuthSuccessPage() {
  const [params] = useSearchParams();
  const displayName = params.get('displayName') || 'User';
  const overlayToken = params.get('token') || '';
  const expiresAt = params.get('expiresAt') || '';

  const baseUrl = window.location.origin;
  const chatUrl = `${baseUrl}/chat?token=${encodeURIComponent(overlayToken)}`;
  const clockUrl = `${baseUrl}/clock?token=${encodeURIComponent(overlayToken)}`;
  const barUrl = `${baseUrl}/bar?token=${encodeURIComponent(overlayToken)}`;

  return (
    <div className="server-page">
      <div className="container">
        <div className="icon-code success-code">✅</div>
        <h1 className="page-title">Authentication Successful!</h1>
        <p className="page-message">
          Welcome, <strong>{displayName}</strong>! Your overlay is now connected to your Twitch account.
        </p>

        <div className="details-section">
          <h3>🎯 Your Overlay Token</h3>
          <p>Use this token in OBS Browser Source URLs:</p>
          <div className="token-box">
            <span>{overlayToken}</span>
            <CopyButton text={overlayToken} />
          </div>
          {expiresAt && (
            <p className="expiry-info">
              <strong>⏰ Token expires:</strong>{' '}
              <span className="expiry-time">{formatExpiryDate(expiresAt)}</span>
              <br />
              <small style={{ color: '#666' }}>
                You'll need to re-authenticate before this time for continued access.
              </small>
            </p>
          )}
        </div>

        <div className="details-section">
          <h3>📺 OBS Browser Source URLs</h3>

          <p><strong>Chat Overlay:</strong></p>
          <div className="url-box">
            <span>{chatUrl}</span>
            <CopyButton text={chatUrl} />
          </div>

          <p><strong>Clock Overlay:</strong></p>
          <div className="url-box">
            <span>{clockUrl}</span>
            <CopyButton text={clockUrl} />
          </div>

          <p><strong>Bar Overlay:</strong></p>
          <div className="url-box">
            <span>{barUrl}</span>
            <CopyButton text={barUrl} />
          </div>
        </div>

        <div className="details-section">
          <h3>📋 Next Steps</h3>
          <ol>
            <li>Copy one of the URLs above</li>
            <li>In OBS, add a Browser Source</li>
            <li>Paste the URL and set size (recommended: 1920x1080)</li>
            <li>Your overlay will now show real follower/subscriber data!</li>
          </ol>

          <h3>🧪 Testing & Demo</h3>
          <p>Want to see what data is available from your Twitch account?</p>
          <a
            href={`/demo?token=${encodeURIComponent(overlayToken)}&displayName=${encodeURIComponent(displayName)}`}
            className="action-btn"
            style={{ marginTop: 10 }}
          >
            📊 View Twitch API Demo
          </a>
        </div>
      </div>
    </div>
  );
}
