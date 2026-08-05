import React, { useState, type FormEvent } from 'react';
import { Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { validPlayerName } from './validation.js';

export interface WelcomeProps {
  onSubmit: (name: string) => void;
  disabled?: boolean;
  message?: string;
}

export function Welcome({ onSubmit, disabled = false, message }: WelcomeProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validPlayerName(name)) {
      setError(true);
      return;
    }
    setError(false);
    onSubmit(name.trim());
  }

  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      sx={{
        boxSizing: 'border-box',
        minHeight: '100dvh',
        p: { xs: 2, sm: 4 },
        width: '100%',
      }}
    >
      <Paper
        component="form"
        onSubmit={submit}
        sx={{
          '&::before': {
            border: '1px solid',
            borderColor: 'rgba(112, 200, 216, 0.12)',
            content: '""',
            inset: 12,
            pointerEvents: 'none',
            position: 'absolute',
          },
          border: '1px solid',
          borderColor: 'rgba(112, 200, 216, 0.28)',
          boxSizing: 'border-box',
          maxWidth: 520,
          overflow: 'hidden',
          p: { xs: 3, sm: 4 },
          position: 'relative',
          width: '100%',
        }}
      >
        <Stack position="relative" spacing={3} zIndex={1}>
          <Stack spacing={1} textAlign="center">
            <Typography
              color="primary"
              component="h1"
              sx={{
                fontSize: { xs: '2.625rem', sm: '3.25rem' },
                lineHeight: 1,
                letterSpacing: '-0.03em',
                maxWidth: '100%',
                overflowWrap: 'anywhere',
              }}
              variant="h2"
            >
              BATTLESHIPS
            </Typography>
            <Typography color="text.secondary">
              Command your fleet. Outlast the waves.
            </Typography>
          </Stack>
          {message ? (
            <Typography color="warning.main">{message}</Typography>
          ) : null}
          <TextField
            autoComplete="nickname"
            autoFocus
            error={error}
            helperText={
              error
                ? 'Use 3–24 characters.'
                : 'Your display name is visible to opponents.'
            }
            label="Name"
            name="name"
            onChange={(event) => {
              setName(event.target.value);
              setError(false);
            }}
            value={name}
          />
          <Button disabled={disabled} type="submit" variant="contained">
            Enter lobby
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
