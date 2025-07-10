# Toucotop Stream Overlay

A modern React TypeScript application for Twitch stream overlays with customizable settings and real-time updates.

## Features

- **Multiple Overlay Components**: Chat, Clock, and Info Bar overlays
- **Persistent Settings**: Settings are saved to localStorage and can be overridden via URL parameters
- **Modern UI**: Clean design with custom color scheme
- **Responsive Design**: Works on different screen sizes
- **Real-time Updates**: Live clock and simulated chat messages
- **OBS Compatible**: Designed for use as browser sources in OBS Studio

## Getting Started

### Development

1. Install dependencies:

```bash
npm install
```

1. Start the development server:

```bash
npm run dev
```

1. Open [http://localhost:5173](http://localhost:5173) to view the main page

### Production Build

```bash
npm run build
```

## Usage

### Setting Up Overlays in OBS

1. Configure your settings on the main page (`/`)
2. Navigate to the desired overlay page:
   - Chat Overlay: `/chat`
   - Clock Overlay: `/clock`
   - Info Bar Overlay: `/bar`
3. Copy the URL and add it as a Browser Source in OBS
4. Set appropriate width/height and position in OBS

### URL Parameters

You can override settings using URL parameters:

```html
?channelName=YourChannel&streamTitle=Amazing%20Stream&overlayOpacity=0.8&previewMode=true
```

Available parameters:

- `channelName`: Your Twitch channel name
- `streamTitle`: Current stream title
- `overlayOpacity`: Overlay transparency (0.1 - 1.0)

## Project Structure

```
src/
├── contexts/
│   └── SettingsContext.tsx    # Global settings management
├── pages/
│   ├── MainPage.tsx           # Settings and navigation
│   ├── ChatOverlay.tsx        # Chat display overlay
│   ├── ClockOverlay.tsx       # Time and duration overlay
│   └── BarOverlay.tsx         # Progress bars and stats
├── styles/
│   ├── MainPage.css
│   ├── ChatOverlay.css
│   ├── ClockOverlay.css
│   └── BarOverlay.css
└── App.tsx                    # Main router component
```

## Color Scheme

The project uses a custom color palette:

- **Dark**: `rgb(31, 15, 1)` - Primary background
- **Main**: `rgb(229, 109, 12)` - Accent color
- **Light**: `rgb(255, 235, 219)` - Text color

## Technology Stack

- **React 18** with TypeScript
- **Vite** for fast development and building
- **React Router** for navigation
- **CSS Custom Properties** for theming
- **Context API** for state management

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test in OBS Studio
5. Submit a pull request

## License

MIT License - feel free to use this project for your streaming needs!
