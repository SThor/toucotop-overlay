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

function RequireToken({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const location = useLocation();
  // Allow landing, error, and denied pages without token
  const allowNoToken = [
    '/', '/auth/success', '/auth/error', '/auth/denied', '/auth/twitch', '/auth/callback', '/404', '/notfound'
  ];
  if (!settings.overlayToken && !allowNoToken.includes(location.pathname)) {
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
