import { createTheme } from '@mui/material/styles';
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#70c8d8' },
    background: { default: '#07131f', paper: '#0d2233' },
  },
  typography: { fontFamily: 'Inter, sans-serif' },
});
