import { useLocation } from 'react-router-dom';
import '../styles/ServerPages.css';

export default function NotFoundPage() {
  const location = useLocation();

  return (
    <div className="server-page">
      <div className="container">
        <div className="icon-code">404</div>
        <h1 className="page-title">Page not found</h1>
        <p className="page-message">
          The page you're looking for doesn't exist.
        </p>
        <div className="path-info">{location.pathname}</div>
      </div>
    </div>
  );
}
