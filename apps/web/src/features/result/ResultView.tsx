import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import type { GameSnapshot } from '@battleships/contracts';

export type CompleteGameSnapshot = Extract<GameSnapshot, { phase: 'complete' }>;

export interface ResultViewProps {
  snapshot: CompleteGameSnapshot;
  connected: boolean;
  pending?: boolean;
  onLeave: () => void;
  onRematchRequest: () => void;
  onRematchRespond: (accept: boolean) => void;
  now?: () => number;
}

export function deriveResult(snapshot: CompleteGameSnapshot) {
  const victory = snapshot.winnerPlayerId === snapshot.self.playerId;
  return {
    outcome: victory ? ('victory' as const) : ('defeat' as const),
    title: victory ? 'Victory' : 'Defeat',
    victory,
  };
}

function completionMessage(snapshot: CompleteGameSnapshot): string {
  const { victory } = deriveResult(snapshot);
  if (snapshot.completionReason === 'forfeit') {
    return victory
      ? `You won by forfeit against ${snapshot.opponent.name}.`
      : `You forfeited to ${snapshot.opponent.name}.`;
  }
  return victory
    ? `You sank ${snapshot.opponent.name}'s fleet.`
    : `${snapshot.opponent.name} sank your fleet.`;
}

function secondsUntil(expiresAt: number, currentTime: number): number {
  return Math.max(0, Math.ceil((expiresAt - currentTime) / 1000));
}

export function ResultView({
  snapshot,
  connected,
  pending = false,
  onLeave,
  onRematchRequest,
  onRematchRespond,
  now = Date.now,
}: ResultViewProps) {
  const [currentTime, setCurrentTime] = useState(now);
  const canAct = connected && !pending;
  const result = deriveResult(snapshot);
  const expiresAt =
    snapshot.rematch.status === 'idle' ? undefined : snapshot.rematch.expiresAt;
  const remaining =
    expiresAt === undefined ? undefined : secondsUntil(expiresAt, currentTime);

  useEffect(() => {
    if (expiresAt === undefined) return undefined;
    const timer = window.setInterval(() => setCurrentTime(now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, now]);

  return (
    <Dialog
      aria-describedby="battle-result-description"
      aria-labelledby="battle-result-title"
      fullWidth
      maxWidth="sm"
      open
      PaperProps={{
        sx: { maxHeight: 'min(560px, calc(100dvh - 32px))', m: 2 },
      }}
    >
      <DialogTitle
        id="battle-result-title"
        component="h1"
        variant="h4"
        sx={{ pb: 1, textAlign: 'center' }}
      >
        {result.title}
      </DialogTitle>
      <DialogContent dividers sx={{ overflowY: 'auto' }}>
        <Stack spacing={2}>
          <Typography id="battle-result-description" textAlign="center">
            {completionMessage(snapshot)}
          </Typography>
          <Typography color="text.secondary" textAlign="center">
            {`Opponent: ${snapshot.opponent.name}`}
          </Typography>
          <Stack
            direction="row"
            justifyContent="space-around"
            sx={{ borderBlock: 1, borderColor: 'divider', py: 1.5 }}
          >
            <Typography textAlign="center">
              {`${snapshot.self.stats?.games ?? 0} games`}
            </Typography>
            <Typography textAlign="center">
              {`${snapshot.self.stats?.wins ?? 0} wins`}
            </Typography>
            <Typography textAlign="center">
              {`${snapshot.self.stats?.losses ?? 0} ${snapshot.self.stats?.losses === 1 ? 'loss' : 'losses'}`}
            </Typography>
          </Stack>
          {snapshot.rematch.status === 'idle' ? (
            <Typography color="text.secondary" textAlign="center">
              Ready for another round?
            </Typography>
          ) : snapshot.rematch.status === 'requested-by-self' ? (
            <Stack spacing={0.5} textAlign="center">
              <Typography>
                Waiting for {snapshot.opponent.name} to accept
              </Typography>
              <Typography color="text.secondary" variant="body2">
                Rematch request expires in {remaining} seconds
              </Typography>
            </Stack>
          ) : (
            <Stack spacing={0.5} textAlign="center">
              <Typography>
                {snapshot.opponent.name} requested a rematch.
              </Typography>
              <Typography color="text.secondary" variant="body2">
                Expires in {remaining} seconds
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', gap: 1, p: 2 }}>
        <Button disabled={!canAct} onClick={onLeave}>
          Return to lobby
        </Button>
        {snapshot.rematch.status === 'idle' ? (
          <Button
            disabled={!canAct}
            onClick={onRematchRequest}
            variant="contained"
          >
            Request rematch
          </Button>
        ) : snapshot.rematch.status === 'requested-by-opponent' ? (
          <>
            <Button disabled={!canAct} onClick={() => onRematchRespond(false)}>
              Decline
            </Button>
            <Button
              disabled={!canAct}
              onClick={() => onRematchRespond(true)}
              variant="contained"
            >
              Accept
            </Button>
          </>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
