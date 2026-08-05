import { useEffect, useState } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';

export const remainingSeconds = (deadline: number, now: number): number =>
  Math.max(0, Math.ceil((deadline - now) / 1000));

export interface ConnectionBannerProps {
  readonly deadline: number | null;
  readonly localDisconnected?: boolean;
  readonly onRetry: () => void;
}

export const ConnectionBanner = ({
  deadline,
  localDisconnected = false,
  onRetry,
}: ConnectionBannerProps) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [deadline]);

  return (
    <Alert
      severity="warning"
      role="status"
      sx={{ width: '100%', maxWidth: 900 }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography>
          {localDisconnected
            ? 'Connection lost — reconnecting automatically.'
            : `Opponent disconnected${deadline === null ? '' : ` — reconnect window ${remainingSeconds(deadline, now)}s`}`}
        </Typography>
        {localDisconnected ? (
          <Button size="small" onClick={onRetry}>
            Retry now
          </Button>
        ) : null}
      </Stack>
    </Alert>
  );
};
