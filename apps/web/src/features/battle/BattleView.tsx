import { useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import type { Coordinate, GameSnapshot } from '@battleships/contracts';
import {
  countAfloatShips,
  createBattleController,
} from './battle-controller.js';
import { BattleBoards } from './BattleBoards.js';
import { ReconnectBanner } from './ReconnectBanner.js';

export type BattleSnapshot = Extract<
  GameSnapshot,
  { phase: 'battle' | 'paused' | 'complete' }
>;

export interface BattleViewProps {
  readonly snapshot: BattleSnapshot;
  readonly pending?: boolean;
  readonly connected?: boolean;
  readonly onShot: (coordinate: Coordinate) => void;
  readonly onLeave: () => void;
  readonly onRetry: () => void;
}

const feedbackLabel = (snapshot: BattleSnapshot) => {
  const latest = snapshot.shots.at(-1);
  return latest
    ? `Last shot: ${latest.result} at ${latest.coordinate}`
    : undefined;
};

export const BattleView = ({
  snapshot,
  pending = false,
  connected = true,
  onShot,
  onLeave,
  onRetry,
}: BattleViewProps) => {
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const controller = useMemo(
    () => createBattleController(snapshot, pending, onShot, connected),
    [connected, onShot, pending, snapshot],
  );
  const latestFeedback = feedbackLabel(snapshot);
  const ownTurn = snapshot.turnPlayerId === snapshot.self.playerId;
  const ownFleet = snapshot.self.fleet ?? [];
  const ownAfloat = countAfloatShips(ownFleet, snapshot.opponentShots ?? []);
  const enemyTotal =
    snapshot.phase === 'complete'
      ? snapshot.opponent.fleet.length
      : ownFleet.length;
  const enemyAfloat =
    snapshot.phase === 'complete'
      ? countAfloatShips(snapshot.opponent.fleet, snapshot.shots)
      : Math.max(0, enemyTotal - snapshot.opponent.sunkShips.length);

  return (
    <Stack
      className={latestFeedback ? 'battle-feedback' : undefined}
      spacing={1}
      alignItems="center"
      sx={{
        height: '100dvh',
        minHeight: 0,
        boxSizing: 'border-box',
        overflow: 'auto',
        px: 3,
        py: 2,
        background: '#061321',
        color: '#d8eef1',
      }}
    >
      <style>{`.battle-feedback { animation: battle-feedback 180ms ease-out; }
       @keyframes battle-feedback { from { opacity: .65; transform: translateY(3px); } to { opacity: 1; transform: none; } }
       @media (prefers-reduced-motion: reduce) { .battle-feedback { animation: none; } }`}</style>
      <Typography
        variant="h4"
        sx={{
          width: '100%',
          height: 48,
          minHeight: 48,
          maxWidth: 'min(100%, 44rem)',
          overflow: 'hidden',
          overflowWrap: 'anywhere',
          lineHeight: '24px',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {`Battle against ${snapshot.opponent.name}`}
      </Typography>
      <Stack
        direction="row"
        spacing={3}
        alignItems="center"
        justifyContent="center"
        sx={{ width: '100%', minHeight: 88, flexShrink: 0 }}
      >
        <Typography>{`Your fleet afloat: ${ownAfloat}/${ownFleet.length}`}</Typography>
        <Typography>{`Enemy fleet afloat: ${enemyAfloat}/${enemyTotal}`}</Typography>
        <Typography
          sx={{
            minWidth: 150,
            maxWidth: 190,
            height: 40,
            overflow: 'hidden',
            overflowWrap: 'anywhere',
            lineHeight: '20px',
            textAlign: 'center',
          }}
        >
          {snapshot.phase === 'complete'
            ? `Winner: ${snapshot.winnerPlayerId === snapshot.self.playerId ? 'you' : snapshot.opponent.name}`
            : ownTurn
              ? pending
                ? 'Shot pending…'
                : 'Your turn'
              : 'Opponent turn'}
        </Typography>
        <Stack spacing={0.5} alignItems="center" sx={{ minWidth: 180 }}>
          {!connected || snapshot.phase === 'paused' ? (
            <ReconnectBanner
              deadline={snapshot.reconnectDeadline}
              localDisconnected={!connected}
              onRetry={onRetry}
            />
          ) : (
            <Typography color="text.secondary" sx={{ minHeight: 24 }}>
              Connected
            </Typography>
          )}
          {latestFeedback ? (
            <Typography role="status" variant="body2" sx={{ minHeight: 24 }}>
              {latestFeedback}
            </Typography>
          ) : (
            <Typography aria-hidden sx={{ minHeight: 24 }} />
          )}
        </Stack>
      </Stack>
      <Stack
        sx={{
          width: '100%',
          minHeight: 0,
          flex: '1 1 auto',
          overflow: 'visible',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BattleBoards snapshot={snapshot} controller={controller} />
      </Stack>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="center"
        sx={{ width: '100%', minHeight: 48, flexShrink: 0 }}
      >
        {snapshot.phase !== 'complete' ? (
          <Button
            color="inherit"
            disabled={!connected || pending}
            onClick={() => setConfirmingLeave(true)}
          >
            Leave
          </Button>
        ) : null}
      </Stack>
      {snapshot.phase !== 'complete' ? (
        <Dialog
          open={confirmingLeave}
          onClose={() => setConfirmingLeave(false)}
        >
          <DialogTitle>Leave this battle?</DialogTitle>
          <DialogContent>Leaving will forfeit the battle.</DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmingLeave(false)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!connected || pending}
              onClick={onLeave}
            >
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </Stack>
  );
};

export default BattleView;
