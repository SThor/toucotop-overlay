import { createTheme } from '@mantine/core';

export const theme = createTheme({
  colors: {
    // CRT orange — used by overlay pages (BarOverlay, ClockOverlay, ChatOverlay)
    crt: [
      '#fff5ed',
      '#ffedd5',
      '#fed7aa',
      '#fdba74',
      '#fb923c',
      '#f97316', // --Main
      '#ea580c',
      '#dc2626',
      '#b91c1c',
      '#1f0f01', // --Dark
    ],
    // Brand purple — dashboard UI (AuthSuccessPage Mantine components)
    // Inspired by the #9146ff / #667eea accents already present in ServerPages.css
    brand: [
      '#f5eeff',
      '#e8daff',
      '#d0b4ff',
      '#b88eff',
      '#a069ff',
      '#9146ff', // Twitch purple
      '#7c3aed', // primary shade (index 6)
      '#6d28d9',
      '#5b21b6',
      '#38115d',
    ],
    // Semantic success
    success: [
      '#f0fdf4',
      '#dcfce7',
      '#bbf7d0',
      '#86efac',
      '#4ade80',
      '#22c55e',
      '#16a34a',
      '#15803d',
      '#166534',
      '#14532d',
    ],
    // Semantic danger
    danger: [
      '#fff1f2',
      '#ffe4e6',
      '#fecdd3',
      '#fda4af',
      '#fb7185',
      '#f43f5e',
      '#e11d48',
      '#be123c',
      '#9f1239',
      '#881337',
    ],
    dark: [
      '#C1C2C5', // lightest text
      '#A6A7AB',
      '#909296',
      '#5c5f66',
      '#373A40',
      '#2C2E33', // input backgrounds
      '#25262b',
      '#1A1B1E',
      '#141517',
      '#101113', // darkest backgrounds
    ],
  },
  primaryColor: 'brand',
  fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
  headings: {
    fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
  },
  components: {
    Slider: { defaultProps: { color: 'brand' } },
    Switch: { defaultProps: { color: 'brand' } },
    Radio:  { defaultProps: { color: 'brand' } },
    TextInput: {
      styles: {
        input: {
          backgroundColor: 'rgba(255, 235, 219, 0.03)',
          borderColor: 'transparent',
          color: 'rgba(255, 235, 219, 0.9)',
          '&:focus': {
            borderColor: 'rgba(249, 115, 22, 0.3)',
            backgroundColor: 'rgba(255, 235, 219, 0.05)',
          },
          '&::placeholder': {
            color: 'rgba(255, 235, 219, 0.4)',
          },
        },
        label: {
          color: 'rgba(255, 235, 219, 0.8)',
          fontWeight: 500,
        },
      },
    },
    Button: {
      styles: {
        root: {
          '&[data-variant="outline"]': {
            borderColor: 'rgba(249, 115, 22, 0.3)',
            color: 'rgba(255, 235, 219, 0.8)',
            backgroundColor: 'transparent',
            '&:hover': {
              backgroundColor: 'rgba(249, 115, 22, 0.05)',
              borderColor: 'rgba(249, 115, 22, 0.4)',
            },
          },
        },
      },
    },
  },
});

