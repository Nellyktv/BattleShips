import React, { useEffect, useState, type ReactNode } from 'react';
import { Box, Typography } from '@mui/material';

export function isDesktopWidth(width: number) {
  return width >= 1024;
}
export function DesktopGate({ children }: { children: ReactNode }) {
  const [desktop, setDesktop] = useState(() =>
    isDesktopWidth(window.innerWidth),
  );
  useEffect(() => {
    const update = () => setDesktop(isDesktopWidth(window.innerWidth));
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  if (!desktop)
    return (
      <Box
        alignItems="center"
        display="flex"
        justifyContent="center"
        minHeight="100vh"
      >
        <Typography variant="h4">Desktop required</Typography>
      </Box>
    );
  return children;
}
