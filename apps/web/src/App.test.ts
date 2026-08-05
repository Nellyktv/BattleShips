// @vitest-environment jsdom
import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GameSnapshot,
  LobbySnapshot,
  PlacementShip,
} from '@battleships/contracts';
import { App, type AppRuntime } from './App.js';
import { cleanup } from '@testing-library/react';
import type { DeploymentViewProps } from './features/deployment/DeploymentView.js';

vi.mock('./features/battle/BattleView.js', () => ({
  default: ({
    onShot,
    onLeave,
    onRetry,
  }: {
    onShot: (coordinate: string) => void;
    onLeave: () => void;
    onRetry: () => void;
  }) =>
    createElement(
      'div',
      null,
      createElement('button', { onClick: () => onShot('C4') }, 'Fire'),
      createElement('button', { onClick: onLeave }, 'Battle leave'),
      createElement('button', { onClick: onRetry }, 'Retry battle'),
    ),
}));

vi.mock('./features/result/ResultView.js', () => ({
  ResultView: ({
    onLeave,
    onRematchRequest,
    onRematchRespond,
  }: {
    onLeave: () => void;
    onRematchRequest: () => void;
    onRematchRespond: (accept: boolean) => void;
  }) =>
    createElement(
      'div',
      null,
      createElement('button', { onClick: onLeave }, 'Return'),
      createElement('button', { onClick: onRematchRequest }, 'Rematch'),
      createElement(
        'button',
        { onClick: () => onRematchRespond(true) },
        'Accept rematch',
      ),
    ),
}));

vi.mock('./features/deployment/DeploymentView.js', () => ({
  default: ({
    initialFleet,
    onReady,
    onCancel,
    onLeave,
    phase,
  }: DeploymentViewProps) =>
    createElement(
      'div',
      null,
      phase === 'waiting'
        ? createElement('p', null, 'Waiting for opponent')
        : null,
      createElement(
        'button',
        { onClick: () => onReady(initialFleet ?? []) },
        'Ready',
      ),
      createElement('button', { onClick: onCancel }, 'Cancel'),
      createElement('button', { onClick: onLeave }, 'Leave'),
    ),
}));

afterEach(cleanup);

const snapshot: LobbySnapshot = {
  kind: 'lobby',
  player: {
    playerId: 'player-1',
    name: 'Captain',
    stats: { games: 0, wins: 0, losses: 0 },
  },
  waitingGames: [],
  activeGames: [],
};

describe('App command errors', () => {
  it('shows and dismisses a rejected command message', () => {
    const clearCommandError = vi.fn();
    const runtime: AppRuntime = {
      snapshot,
      name: 'Captain',
      connection: 'connected',
      recoveryNotice: null,
      commandError: { code: 'invalid-state', message: 'Game is already full' },
      clearCommandError,
      pendingActionId: null,
      gateway: {
        identify: vi.fn(),
        dispatch: vi.fn(),
        retryNow: vi.fn(),
      },
    };

    render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/lobby'] },
        createElement(App, { runtime }),
      ),
    );

    expect(screen.getByText('Game is already full')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(clearCommandError).toHaveBeenCalledOnce();
  });
});

const deploymentFleet: PlacementShip[] = [
  { length: 5, cells: ['A1', 'B1', 'C1', 'D1', 'E1'] },
  { length: 4, cells: ['A3', 'B3', 'C3', 'D3'] },
  { length: 3, cells: ['A5', 'B5', 'C5'] },
  { length: 3, cells: ['A7', 'B7', 'C7'] },
  { length: 2, cells: ['A9', 'B9'] },
];

const gameSnapshot = (
  phase: 'waiting' | 'deployment',
  fleet?: GameSnapshot['self']['fleet'],
): GameSnapshot => ({
  kind: 'game',
  gameId: 'game-1',
  preset: 'classic-10x10',
  phase,
  self: {
    playerId: 'player-1',
    name: 'Captain',
    status: 'placing',
    ...(fleet ? { fleet } : {}),
  },
  opponent:
    phase === 'waiting'
      ? { playerId: '', name: '', status: 'disconnected' }
      : { playerId: 'player-2', name: 'Admiral', status: 'placing' },
  turnPlayerId: null,
  reconnectDeadline: null,
  shots: [],
});

const runtimeFor = (
  snapshot: GameSnapshot,
  dispatch: ReturnType<typeof vi.fn>,
): AppRuntime => ({
  snapshot,
  name: 'Captain',
  connection: 'connected',
  recoveryNotice: null,
  commandError: null,
  clearCommandError: vi.fn(),
  pendingActionId: null,
  gateway: { identify: vi.fn(), dispatch, retryNow: vi.fn() },
});

describe('App deployment integration', () => {
  it('renders waiting deployment and dispatches host cancel', async () => {
    const dispatch = vi.fn();
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/games/game-1'] },
        createElement(App, {
          runtime: runtimeFor(gameSnapshot('waiting'), dispatch),
        }),
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'lobby.cancel',
      payload: {},
    });
    expect(screen.getByText('Waiting for opponent')).toBeTruthy();
  });

  it('dispatches exact fleet.ready and confirmed game leave during deployment', async () => {
    const dispatch = vi.fn();
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/games/game-1'] },
        createElement(App, {
          runtime: runtimeFor(
            gameSnapshot('deployment', deploymentFleet),
            dispatch,
          ),
        }),
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Ready' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: 'fleet.ready',
      payload: { ships: deploymentFleet },
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: 'game.leave',
      payload: {},
    });
  });
});

const battleSnapshot = (
  phase: 'battle' | 'paused' = 'battle',
): GameSnapshot => ({
  ...gameSnapshot('deployment', deploymentFleet),
  phase,
  self: {
    playerId: 'player-1',
    name: 'Captain',
    status: 'ready',
    fleet: deploymentFleet,
  },
  opponent: {
    playerId: 'player-2',
    name: 'Admiral',
    status: phase === 'paused' ? 'disconnected' : 'ready',
    sunkShips: [],
  },
  turnPlayerId: 'player-1',
  reconnectDeadline: phase === 'paused' ? 12_000 : null,
  opponentShots: [],
});

const completeSnapshot = (): GameSnapshot =>
  ({
    ...battleSnapshot(),
    phase: 'complete',
    turnPlayerId: null,
    opponent: {
      playerId: 'player-2',
      name: 'Admiral',
      status: 'ready',
      fleet: deploymentFleet,
    },
    winnerPlayerId: 'player-1',
    completionReason: 'sunk',
    rematch: { status: 'idle' },
  }) as GameSnapshot;

describe('App battle and results integration', () => {
  it('maps battle actions to authoritative commands and Retry now to the gateway', async () => {
    const dispatch = vi.fn();
    const retryNow = vi.fn();
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/games/game-1'] },
        createElement(App, {
          runtime: {
            ...runtimeFor(battleSnapshot('paused'), dispatch),
            gateway: { identify: vi.fn(), dispatch, retryNow },
          },
        }),
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Fire' }));
    fireEvent.click(screen.getByRole('button', { name: 'Battle leave' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry battle' }));

    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: 'game.shot',
      payload: { coordinate: 'C4' },
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: 'game.leave',
      payload: {},
    });
    expect(retryNow).toHaveBeenCalledOnce();
  });

  it('keeps complete boards visible and maps result actions', async () => {
    const dispatch = vi.fn();
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/games/game-1'] },
        createElement(App, {
          runtime: runtimeFor(completeSnapshot(), dispatch),
        }),
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Return' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept rematch' }));

    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: 'game.leave',
      payload: {},
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: 'rematch.request',
      payload: {},
    });
    expect(dispatch).toHaveBeenNthCalledWith(3, {
      type: 'rematch.respond',
      payload: { accept: true },
    });
  });
});
