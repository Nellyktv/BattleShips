import React, { useState } from 'react';
import {
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { LobbySnapshot, Preset } from '@battleships/contracts';
import { CreateGame } from '../game/CreateGame.js';
import { validPlayerName } from '../welcome/validation.js';

export type LobbyViewModel = LobbySnapshot & {
  connected: boolean;
  pendingActionId?: string | null;
};
export interface LobbyActions {
  create: (preset: Preset) => void;
  join: (gameId: string) => void;
  quickPlay: () => void;
  cancel: (gameId: string) => void;
  rename: (name: string) => void;
  leave: () => void;
}
export interface LobbyProps {
  model: LobbyViewModel;
  actions: LobbyActions;
  unavailableMessage?: string;
}

const presetLabels: Record<Preset, string> = {
  'quick-8x8': 'Quick 8×8',
  'classic-10x10': 'Classic 10×10',
  'grand-12x12': 'Grand 12×12',
};
const phaseLabels = {
  placing: 'Deploying',
  battle: 'In battle',
  paused: 'Paused',
} as const;

export function Lobby({ model, actions, unavailableMessage }: LobbyProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(model.player.name);
  const [renameError, setRenameError] = useState(false);
  const canAct = model.connected && !model.pendingActionId;
  return (
    <Stack spacing={4} padding={5}>
      {unavailableMessage ? (
        <Typography color="warning.main">{unavailableMessage}</Typography>
      ) : null}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack>
          <Typography component="h1" variant="h4">
            Fleet lobby
          </Typography>
          <Typography color="text.secondary">{model.player.name}</Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            color={model.connected ? 'success' : 'warning'}
            label={model.connected ? 'Connected' : 'Disconnected'}
          />
          <Typography>{model.player.stats.games} games</Typography>
          <Typography>{model.player.stats.wins} wins</Typography>
          <Typography>{model.player.stats.losses} losses</Typography>
          <Button
            disabled={!canAct}
            onClick={() => {
              setName(model.player.name);
              setRenameError(false);
              setRenameOpen(true);
            }}
          >
            Change name
          </Button>
          <Button disabled={!canAct} onClick={actions.leave}>
            Leave
          </Button>
        </Stack>
      </Stack>
      <Stack direction="row" spacing={2}>
        <Button
          disabled={!canAct}
          onClick={() => setCreateOpen(true)}
          variant="contained"
        >
          Create
        </Button>
        <Button
          disabled={!canAct}
          onClick={actions.quickPlay}
          variant="outlined"
        >
          Quick Play
        </Button>
      </Stack>
      <Stack spacing={2}>
        <Typography component="h2" variant="h5">
          Waiting games
        </Typography>
        <Grid container spacing={2}>
          {model.waitingGames.length === 0 ? (
            <Typography color="text.secondary">
              No waiting games yet.
            </Typography>
          ) : (
            model.waitingGames.map((game) => (
              <Card key={game.gameId} variant="outlined">
                <CardContent>
                  <Typography>{game.hostName}</Typography>
                  <Typography color="text.secondary">
                    {presetLabels[game.preset]}
                  </Typography>
                </CardContent>
                <CardActions>
                  <Button
                    aria-label={`Join ${game.hostName}`}
                    disabled={!canAct}
                    onClick={() => actions.join(game.gameId)}
                  >
                    Join
                  </Button>
                  {game.hostName === model.player.name ? (
                    <Button
                      disabled={!canAct}
                      onClick={() => actions.cancel(game.gameId)}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </CardActions>
              </Card>
            ))
          )}
        </Grid>
      </Stack>
      <Stack spacing={2}>
        <Typography component="h2" variant="h5">
          Active games
        </Typography>
        <Grid container spacing={2}>
          {model.activeGames.length === 0 ? (
            <Typography color="text.secondary">No active games.</Typography>
          ) : (
            model.activeGames.map((game) => (
              <Card key={game.gameId} variant="outlined">
                <CardContent>
                  <Typography>{game.players.join(' vs ')}</Typography>
                  <Typography color="text.secondary">
                    {presetLabels[game.preset]}
                  </Typography>
                  <Chip label={phaseLabels[game.phase]} />
                </CardContent>
              </Card>
            ))
          )}
        </Grid>
      </Stack>
      <CreateGame
        disabled={!canAct}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(preset) => {
          setCreateOpen(false);
          actions.create(preset);
        }}
      />
      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)}>
        <DialogTitle>Change name</DialogTitle>
        <DialogContent>
          <TextField
            error={renameError}
            helperText={renameError ? 'Use 3–24 characters.' : undefined}
            label="New name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)}>Cancel</Button>
          <Button
            disabled={!canAct}
            onClick={() => {
              if (!validPlayerName(name)) {
                setRenameError(true);
                return;
              }
              actions.rename(name.trim());
              setRenameOpen(false);
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
