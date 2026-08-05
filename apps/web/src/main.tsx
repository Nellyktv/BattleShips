import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { AppShell } from './App.js';
import { theme } from './theme.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppShell />
    </ThemeProvider>
  </StrictMode>,
);
