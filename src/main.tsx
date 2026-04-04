import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Y2K / Gothic Techno fonts (loaded only when bundled — no CDN requests)
import '@fontsource/unifrakturmaguntia/400.css'
import '@fontsource-variable/climate-crisis/index.css'
import '@fontsource/press-start-2p/400.css'
import '@fontsource/libre-barcode-39/400.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
