import { createTheme } from '@mui/material/styles'
import type {} from '@mui/material/themeCssVarsAugmentation'

declare module '@mui/material/styles' {
  interface TypeBackground {
    highlight: string
  }
}

/** Adapted from nomad-gui/src/components/theme/themeOptions.ts for Material UI 9. */
export const nomadTheme = createTheme({
  cssVariables: { colorSchemeSelector: 'data' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#2A4CDF', dark: '#192E86', light: '#7F94EC' },
        secondary: { main: '#008A67', dark: '#00533E', light: '#80C583' },
        background: {
          default: '#F8F8FA',
          paper: '#FFFFFF',
          highlight: '#EFEFF7',
        },
        text: {
          primary: '#1D1D1D',
          secondary: '#666666',
          disabled: 'rgba(102,102,102,0.75)',
        },
        error: { main: '#C10007' },
        info: { main: '#1447E6' },
        success: { main: '#007A55' },
        warning: { main: '#BB4D0E' },
      },
    },
    dark: {
      palette: {
        primary: {
          main: '#8B8CEC',
          dark: '#6162A5',
          light: '#A2A3EF',
          contrastText: '#121212',
        },
        secondary: {
          main: '#379777',
          dark: '#266953',
          light: '#5FAB92',
          contrastText: '#121212',
        },
        background: {
          default: '#121212',
          paper: '#1C2026',
          highlight: '#25262D',
        },
        text: {
          primary: 'rgba(255,255,255,0.85)',
          secondary: 'rgba(255,255,255,0.7)',
          disabled: 'rgba(255,255,255,0.65)',
        },
        error: { main: '#FFC9C9' },
        info: { main: '#CCF0FF' },
        success: { main: '#C4FFE0' },
        warning: { main: '#FFE5C4' },
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Titillium Web", sans-serif',
    fontWeightMedium: 600,
    h1: { fontSize: 26, lineHeight: 1.3, fontWeight: 700 },
    h2: { fontSize: 20, lineHeight: 1.4, fontWeight: 700 },
    h3: { fontSize: 18, lineHeight: 1.4, fontWeight: 700 },
    h4: { fontSize: 15, lineHeight: 1.4, fontWeight: 700 },
    h5: { fontSize: 14, lineHeight: 1.4, fontWeight: 700 },
    h6: { fontSize: 12, lineHeight: 1.4, fontWeight: 700 },
    button: { fontWeight: 700 },
  },
  components: {
    MuiButtonBase: {
      styleOverrides: {
        root: ({ theme }) => ({
          '&.Mui-focusVisible, &:focus-visible': {
            outline: `2px solid ${theme.vars.palette.primary.main}`,
            outlineOffset: 2,
          },
        }),
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { whiteSpace: 'nowrap', minWidth: 'max-content' },
      },
    },
    MuiPaper: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        rounded: ({ theme }) => ({
          boxShadow: theme.vars.shadows[1],
          ...theme.applyStyles('dark', { boxShadow: 'none' }),
        }),
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 8, fontWeight: 600 } },
    },
    MuiTableCell: {
      styleOverrides: { head: { fontWeight: 700 } },
    },
    MuiCardHeader: {
      styleOverrides: { title: { fontSize: 16, fontWeight: 700 } },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontSize: 24, fontWeight: 700 } },
    },
  },
})
