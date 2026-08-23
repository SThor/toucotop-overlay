import { useSearchParams } from 'react-router-dom';
import '../styles/ServerPages.css';

export default function AccessDeniedPage() {
  const [params] = useSearchParams();
  const username = params.get('username') || 'Unknown';

  return (
    <div className="server-page">
      <div className="container">
        <div className="icon-code access-denied">🚫</div>
        <h1 className="page-title">Access Denied</h1>
        <p className="page-message">
          You are not authorized to use this overlay system.
        </p>
        <div className="user-info">{username}</div>

        <div className="details-section">
          <h3>This overlay system is restricted to:</h3>
          <p>
            Only authorized streamers can use this overlay system. If you believe
            you should have access, please contact the stream admin to be added to
            the allowed users list.
          </p>
        </div>
      </div>
    </div>
  );
}
