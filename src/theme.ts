import { createTheme } from '@mantine/core';

export const theme = createTheme({
  colors: {
    // Custom brand colors based on your CSS variables
    brand: [
      '#fff5ed', // lightest
      '#ffedd5',
      '#fed7aa',
      '#fdba74',
      '#fb923c',
      '#f97316', // main orange (--Main)
      '#ea580c',
      '#dc2626',
      '#b91c1c',
      '#1f0f01', // darkest (--Dark)
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
//   components: {
//     TextInput: {
//       styles: {
//         input: {
//           backgroundColor: 'rgba(255, 235, 219, 0.05)', // Very dark background using your --Light color
//           borderColor: 'rgba(229, 109, 12, 0.3)', // Subtle orange border using your --Main color
//           color: 'rgba(255, 235, 219, 0.9)', // Light text using your --Light color
//           '&:focus': {
//             borderColor: '#f97316', // Your main orange on focus
//             backgroundColor: 'rgba(255, 235, 219, 0.08)',
//           },
//           '&::placeholder': {
//             color: 'rgba(255, 235, 219, 0.5)', // Dimmed placeholder
//           },
//         },
//         label: {
//           color: '#f97316', // Your main orange for labels
//           fontWeight: 600,
//         },
//       },
//     },
//     Button: {
//       styles: {
//         root: {
//           '&[data-variant="outline"]': {
//             borderColor: '#f97316',
//             color: '#f97316',
//             '&:hover': {
//               backgroundColor: 'rgba(249, 115, 22, 0.1)',
//             },
//           },
//         },
//       },
//     },
});
