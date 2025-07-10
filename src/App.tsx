import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { SettingsProvider } from './contexts/SettingsContext';
import { TwitchProvider } from './contexts/TwitchContext';
import { theme } from './theme';
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
                <Route path="/" element={<MainPage />} />
                <Route path="/chat" element={<ChatOverlay />} />
                <Route path="/clock" element={<ClockOverlay />} />
                <Route path="/bar" element={<BarOverlay />} />
              </Routes>
            </div>
          </Router>
        </TwitchProvider>
      </SettingsProvider>
    </MantineProvider>
  );
}

export default App;
