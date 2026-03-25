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
import './App.css';

function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <SettingsProvider>
        <TwitchProvider>
          <Router>
            <div className="App">
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
          </Router>
        </TwitchProvider>
      </SettingsProvider>
    </MantineProvider>
  );
}

export default App;
