import React from 'react';
import { Button, Stack, Typography } from '@mui/material';

export function WaitingView({ onCancel }: { onCancel: () => void }) {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      spacing={2}
    >
      <Typography component="h1" variant="h4">
        Waiting for an opponent
      </Typography>
      <Typography color="text.secondary">
        Your game is ready to join.
      </Typography>
      <Button onClick={onCancel} variant="outlined">
        Cancel
      </Button>
    </Stack>
  );
}
