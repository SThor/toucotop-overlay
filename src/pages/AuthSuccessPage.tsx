import { useEffect, useState } from 'react';
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

interface AuthStatus {
  authenticated: boolean;
  displayName?: string;
  expiresAt?: string;
}

export default function AuthSuccessPage() {
  const [params] = useSearchParams();
  const overlayToken = params.get('token') || '';

  const [displayName, setDisplayName] = useState(params.get('displayName') || '');
  const [expiresAt, setExpiresAt] = useState(params.get('expiresAt') || '');
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (!overlayToken) {
      setSessionExpired(true);
      return;
    }
    fetch(`/auth/status?token=${encodeURIComponent(overlayToken)}`)
      .then((res) => res.json() as Promise<AuthStatus>)
      .then((data) => {
        if (data.authenticated) {
          localStorage.setItem('toucotop-overlay-token', overlayToken);
          // Strip token (and other sensitive params) from the URL so they don't
          // linger in browser history or leak via referrer headers.
          window.history.replaceState({}, '', window.location.pathname);
          if (data.displayName) setDisplayName(data.displayName);
          if (data.expiresAt) setExpiresAt(data.expiresAt);
        } else {
          setSessionExpired(true);
        }
      })
      .catch(() => {
        // Leave seeded values in place on network error
      });
  }, [overlayToken]);

  // Redirect immediately when session is expired
  useEffect(() => {
    if (sessionExpired) {
      window.location.href = '/auth/twitch';
    }
  }, [sessionExpired]);

  if (sessionExpired) {
    return (
      <div className="server-page">
        <div className="container">
          <div className="icon-code">⏰</div>
          <h1 className="page-title">Session Expired</h1>
          <p className="page-message">Redirecting you to re-authenticate…</p>
          <a href="/auth/twitch" className="action-btn">🔄 Re-authenticate now</a>
        </div>
      </div>
    );
  }

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
          Welcome, <strong>{displayName || '…'}</strong>! Your overlay is now connected to your Twitch account.
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
            href={`/demo?token=${encodeURIComponent(overlayToken)}`}
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
