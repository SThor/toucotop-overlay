<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Twitch Stream OBS Overlay Project

This is a React TypeScript project for a Twitch stream OBS overlay using Vite as the build tool.

## Project Structure
- Clean, modern UI with routing between different overlay components
- Main page with navigation and settings management
- Persistent settings with localStorage and query parameter support
- Custom color scheme based on provided brand colors
- Real-time Twitch chat integration with message deletion handling
- Framer Motion animations for smooth, professional UI transitions
- CRT-style visual effects for retro gaming aesthetic

## Color Scheme
Use these CSS custom properties throughout the project:
```css
--DarkRGBA: 31, 15, 1;
--MainRGBA: 229, 109, 12;
--LightRGBA: 255, 235, 219;
--Dark: rgb(var(--DarkRGBA));
--Main: rgb(var(--MainRGBA));
--Light: rgb(var(--LightRGBA));
```

## Pages
- Main: Navigation hub and settings management
- Chat: Real-time Twitch chat overlay with anonymous IRC connection
- Clock: Clock overlay component with CRT styling
- Bar: Progress/info bar overlay component

## Technical Stack
- **Twitch Integration**: @twurple packages for chat and API
- **Animations**: Framer Motion for layout animations and transitions
- **Performance**: Optimized for OBS Browser Source usage
- **Authentication**: Optional Twitch OAuth for advanced features, anonymous chat reading

## Settings Management
- Channel name and other settings persist across sessions
- Query parameters can override and update persistent settings
- Settings are shared across all overlay components
- Twitch credentials (Client ID, Access Token) for enhanced features
- Visual effect intensity controls (CRT effects, animations)

## Visual Effects
- Subtle CRT effects: glow, scanlines, chromatic aberration
- Performance-optimized for streaming software
- Toggleable intensity levels
- Fallback to simpler effects for performance

## Development Notes
- Use subtle effects to avoid detracting from stream content
- Maintain backward compatibility with existing AnimatedBackground
- All overlays should work without authentication for easy setup
- Development server (`npm run dev`) is already running - no need to start it
