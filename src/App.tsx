import { useSettings } from './contexts/SettingsContext';
import { Navigate, useLocation } from 'react-router-dom';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { SettingsProvider } from './contexts/SettingsContext';
import { TwitchProvider } from './contexts/TwitchContext';
import { theme } from './theme';
import LandingPage from './pages/LandingPage';
import AuthSuccessPage from './pages/AuthSuccessPage';
import AuthErrorPage from './pages/AuthErrorPage';
import AccessDeniedPage from './pages/AccessDeniedPage';
import NotFoundPage from './pages/NotFoundPage';
import DemoPage from './pages/DemoPage';
import MainPage from './pages/MainPage';
import ChatOverlay from './pages/ChatOverlay';
import ClockOverlay from './pages/ClockOverlay';
import BarOverlay from './pages/BarOverlay';
import NavMenu from './components/NavMenu';
import './App.css';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

// Pages that don't need a valid token
const ALLOW_NO_TOKEN = [
  '/', '/auth/success', '/auth/error', '/auth/denied', '/auth/twitch', '/auth/callback', '/404', '/notfound'
];

// Module-level cache so navigation between routes doesn't re-trigger validation
interface ValidationCache {
  token: string;
  validUntil: number;
}
let validationCache: ValidationCache | null = null;
const VALIDATION_TTL_MS = 5 * 60 * 1000; // re-check at most every 5 minutes

function RequireToken({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const location = useLocation();
  const [params] = useSearchParams();
  const redirectingRef = useRef(false);

  // Sync token from query param into settings if present
  useEffect(() => {
    const token = params.get('token');
    if (token && token !== settings.overlayToken) {
      updateSettings({ overlayToken: token });
    }
  }, [params, settings.overlayToken, updateSettings]);

  // Validate token with server on protected routes
  useEffect(() => {
    const token = settings.overlayToken;
    if (!token || ALLOW_NO_TOKEN.includes(location.pathname)) return;

    const now = Date.now();
    if (validationCache && validationCache.token === token && now < validationCache.validUntil) return;

    fetch(`/auth/status?token=${encodeURIComponent(token)}`)
      .then((res) => res.json() as Promise<{ authenticated: boolean }>)
      .then((data) => {
        if (data.authenticated) {
          validationCache = { token, validUntil: now + VALIDATION_TTL_MS };
        } else if (!redirectingRef.current) {
          redirectingRef.current = true;
          validationCache = null;
          window.location.href = '/auth/twitch';
        }
      })
      .catch(() => {
        // Network error — assume valid to avoid spurious redirects
      });
  }, [settings.overlayToken, location.pathname]);

  if (!settings.overlayToken && !ALLOW_NO_TOKEN.includes(location.pathname)) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <SettingsProvider>
        <TwitchProvider>
          <Router>
            <RequireToken>
              <div className="App">
                <NavMenu />
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/auth/success" element={<AuthSuccessPage />} />
                  <Route path="/auth/error" element={<AuthErrorPage />} />
                  <Route path="/auth/denied" element={<AccessDeniedPage />} />
                  <Route path="/demo" element={<DemoPage />} />
                  <Route path="/settings" element={<MainPage />} />
                  <Route path="/chat" element={<ChatOverlay />} />
                  <Route path="/clock" element={<ClockOverlay />} />
                  <Route path="/bar" element={<BarOverlay />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </div>
            </RequireToken>
          </Router>
        </TwitchProvider>
      </SettingsProvider>
    </MantineProvider>
  );
}

export default App;
