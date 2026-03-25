import '../styles/ServerPages.css';

export default function AuthErrorPage() {
  return (
    <div className="server-page">
      <div className="container">
        <div className="icon-code auth-error">🔐</div>
        <h1 className="page-title">Authentication Error</h1>
        <p className="page-message">OAuth state validation failed.</p>

        <div className="details-section">
          <h3>This can happen if:</h3>
          <ul>
            <li>Cookies are disabled in your browser</li>
            <li>The authentication took too long (session expired)</li>
            <li>You navigated back and tried again</li>
            <li>Your browser has strict privacy settings</li>
          </ul>
        </div>

        <div className="details-section">
          <h3>Solutions:</h3>
          <ol>
            <li>Make sure cookies are enabled for this site</li>
            <li>Try the authentication process again</li>
            <li>Clear your browser cache and cookies</li>
            <li>If problems persist, contact the stream admin</li>
          </ol>
        </div>

        <a href="/auth/twitch" className="action-btn">🔄 Try Authentication Again</a>
      </div>
    </div>
  );
}
