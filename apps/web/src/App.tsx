import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Snackbar } from '@mui/material';
import type { Snapshot } from '@battleships/contracts';
import { type CommandInput, type SocketBoundary } from './socket/client.js';
import { useGameSocket } from './socket/use-game-socket.js';
import { useGameStore } from './state/game-store.js';
import type { ConnectionState, RecoveryNotice } from './state/types.js';
import { getSessionStorage } from './socket/client.js';
import { DesktopGate } from './components/DesktopGate.js';
import {
  Lobby,
  type LobbyActions,
  type LobbyViewModel,
} from './features/lobby/Lobby.js';
import { Welcome } from './features/welcome/Welcome.js';
import {
  AppRoutes,
  authoritativePath,
  authoritativeTransition,
} from './routes.js';

const DISPLAY_NAME_STORAGE_KEY = 'battleships.displayName';
const DeploymentView = React.lazy(
  () => import('./features/deployment/DeploymentView.js'),
);
const BattleView = React.lazy(() => import('./features/battle/BattleView.js'));
const ResultView = React.lazy(async () => ({
  default: (await import('./features/result/ResultView.js')).ResultView,
}));

export interface AppModel {
  lobby?: LobbyViewModel;
  actions?: LobbyActions;
  game?: React.ReactNode;
}

export interface AppRuntime {
  snapshot: Snapshot | null;
  name: string;
  connection: ConnectionState;
  recoveryNotice: RecoveryNotice;
  commandError: { code: string; message: string } | null;
  clearCommandError: () => void;
  pendingActionId: string | null;
  gateway: Pick<
    ReturnType<typeof useGameSocket>,
    'identify' | 'dispatch' | 'retryNow'
  >;
}

function isReady(runtime: AppRuntime) {
  return runtime.connection === 'connected' && runtime.pendingActionId === null;
}

function useUnavailableMessage() {
  const location = useLocation();
  const state = location.state as { message?: unknown } | null;
  return typeof state?.message === 'string' ? state.message : undefined;
}

export function App({
  runtime,
  model,
}: {
  runtime: AppRuntime;
  model?: AppModel;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState: unknown = location.state;
  const unavailableMessage = useUnavailableMessage();
  const [showWelcome, setShowWelcome] = useState(runtime.snapshot === null);
  const manualWelcome = useRef(false);
  const awaitingIdentifySnapshot = useRef(false);
  const snapshotBeforeIdentify = useRef<Snapshot | null>(null);
  const canAct = isReady(runtime);

  useEffect(() => {
    if (runtime.recoveryNotice) {
      manualWelcome.current = true;
      awaitingIdentifySnapshot.current = false;
      setShowWelcome(true);
      getSessionStorage().removeItem(DISPLAY_NAME_STORAGE_KEY);
      const transition = authoritativeTransition(
        location.pathname,
        '/',
        locationState,
        runtime.snapshot ?? undefined,
      );
      if (transition) {
        const { pathname, ...options } = transition;
        void navigate(pathname, options);
      }
      return;
    }
    const receivedIdentifySnapshot =
      runtime.snapshot &&
      awaitingIdentifySnapshot.current &&
      runtime.snapshot !== snapshotBeforeIdentify.current;
    if (receivedIdentifySnapshot) {
      awaitingIdentifySnapshot.current = false;
    }
    if (
      runtime.snapshot &&
      !manualWelcome.current &&
      !awaitingIdentifySnapshot.current
    ) {
      setShowWelcome(false);
      const path = authoritativePath(runtime.snapshot);
      const transition = authoritativeTransition(
        location.pathname,
        path,
        locationState,
        runtime.snapshot ?? undefined,
      );
      if (transition) {
        const { pathname, ...options } = transition;
        void navigate(pathname, options);
      }
    } else if (showWelcome) {
      const transition = authoritativeTransition(
        location.pathname,
        '/',
        locationState,
        runtime.snapshot ?? undefined,
      );
      if (transition) {
        const { pathname, ...options } = transition;
        void navigate(pathname, options);
      }
    }
  }, [
    location.pathname,
    locationState,
    navigate,
    runtime.recoveryNotice,
    runtime.snapshot,
    showWelcome,
  ]);

  const dispatch = (command: CommandInput) => {
    if (canAct) runtime.gateway.dispatch(command);
  };
  const actions: LobbyActions = model?.actions ?? {
    create: (preset) => dispatch({ type: 'lobby.create', payload: { preset } }),
    join: (gameId) => dispatch({ type: 'lobby.join', payload: { gameId } }),
    quickPlay: () => dispatch({ type: 'lobby.quick-play', payload: {} }),
    cancel: () => dispatch({ type: 'lobby.cancel', payload: {} }),
    rename: (name) => dispatch({ type: 'rename', payload: { name } }),
    leave: () => {
      manualWelcome.current = true;
      awaitingIdentifySnapshot.current = false;
      setShowWelcome(true);
      const transition = authoritativeTransition(
        location.pathname,
        '/',
        locationState,
        runtime.snapshot ?? undefined,
      );
      if (transition) {
        const { pathname, ...options } = transition;
        void navigate(pathname, options);
      }
      dispatch({ type: 'leave', payload: {} });
    },
  };
  const lobbySnapshot =
    model?.lobby ??
    (runtime.snapshot?.kind === 'lobby'
      ? {
          ...runtime.snapshot,
          connected: runtime.connection === 'connected',
          pendingActionId: runtime.pendingActionId,
        }
      : undefined);
  const submitName = (name: string) => {
    if (!canAct) return;
    manualWelcome.current = false;
    awaitingIdentifySnapshot.current = true;
    snapshotBeforeIdentify.current = runtime.snapshot;
    getSessionStorage().setItem(DISPLAY_NAME_STORAGE_KEY, name);
    runtime.gateway.identify(name);
  };
  const welcome = (
    <Welcome
      disabled={!canAct}
      message={
        runtime.recoveryNotice === 'runtime-reset'
          ? 'The server restarted. Choose a name to reconnect.'
          : runtime.recoveryNotice === 'session-replaced'
            ? 'This tab was replaced by a newer connection.'
            : undefined
      }
      onSubmit={submitName}
    />
  );
  const lobby = lobbySnapshot ? (
    <Lobby
      actions={actions}
      model={lobbySnapshot}
      unavailableMessage={unavailableMessage}
    />
  ) : (
    welcome
  );
  const gameSnapshot =
    runtime.snapshot?.kind === 'game' ? runtime.snapshot : undefined;
  const game =
    model?.game ??
    (gameSnapshot ? (
      gameSnapshot.phase === 'waiting' ||
      gameSnapshot.phase === 'deployment' ? (
        <React.Suspense fallback={<div>Loading deployment</div>}>
          <DeploymentView
            gameKey={gameSnapshot.gameId}
            initialFleet={gameSnapshot.self.fleet?.map(({ length, cells }) => ({
              length,
              cells: [...cells],
            }))}
            locked={gameSnapshot.self.status === 'ready'}
            pending={runtime.pendingActionId !== null}
            connected={runtime.connection === 'connected'}
            onRetry={runtime.gateway.retryNow}
            reconnectDeadline={gameSnapshot.reconnectDeadline}
            onCancel={() => dispatch({ type: 'lobby.cancel', payload: {} })}
            onLeave={() => dispatch({ type: 'game.leave', payload: {} })}
            onReady={(fleet) =>
              dispatch({
                type: 'fleet.ready',
                payload: {
                  ships: fleet.map(({ length, cells }) => ({
                    length,
                    cells: [...cells],
                  })),
                },
              })
            }
            opponentStatus={
              gameSnapshot.opponent.playerId
                ? gameSnapshot.opponent.status
                : 'waiting'
            }
            phase={gameSnapshot.phase}
            preset={gameSnapshot.preset}
          />
        </React.Suspense>
      ) : (
        <React.Suspense fallback={<div>Loading battle</div>}>
          <React.Fragment>
            <BattleView
              snapshot={gameSnapshot}
              pending={runtime.pendingActionId !== null}
              connected={runtime.connection === 'connected'}
              onShot={(coordinate) =>
                dispatch({ type: 'game.shot', payload: { coordinate } })
              }
              onLeave={() => dispatch({ type: 'game.leave', payload: {} })}
              onRetry={runtime.gateway.retryNow}
            />
            {gameSnapshot.phase === 'complete' ? (
              <ResultView
                snapshot={gameSnapshot}
                connected={runtime.connection === 'connected'}
                pending={runtime.pendingActionId !== null}
                onLeave={() => dispatch({ type: 'game.leave', payload: {} })}
                onRematchRequest={() =>
                  dispatch({ type: 'rematch.request', payload: {} })
                }
                onRematchRespond={(accept) =>
                  dispatch({ type: 'rematch.respond', payload: { accept } })
                }
              />
            ) : null}
          </React.Fragment>
        </React.Suspense>
      )
    ) : (
      <div>Game loading</div>
    ));

  return (
    <DesktopGate>
      <AppRoutes
        game={game}
        gameSnapshot={
          runtime.snapshot?.kind === 'game' ? runtime.snapshot : undefined
        }
        lobby={showWelcome ? welcome : lobby}
        welcome={welcome}
      />
      <Snackbar
        autoHideDuration={6000}
        onClose={runtime.clearCommandError}
        open={runtime.commandError !== null}
      >
        <Alert onClose={runtime.clearCommandError} severity="error">
          {runtime.commandError?.message}
        </Alert>
      </Snackbar>
    </DesktopGate>
  );
}

export function AppShell({
  model,
  socket,
}: {
  model?: AppModel;
  socket?: SocketBoundary;
}) {
  const name = useGameStore((state) => state.name);
  const setName = useGameStore((state) => state.setName);
  const clearCommandError = useGameStore((state) => state.setCommandError);
  useLayoutEffect(() => {
    if (name) return;
    const storedName = getSessionStorage().getItem(DISPLAY_NAME_STORAGE_KEY);
    if (storedName) setName(storedName);
  }, [name, setName]);
  const gateway = useGameSocket(window.location.origin, socket);
  const runtime: AppRuntime = {
    snapshot: useGameStore((state) => state.snapshot),
    name,
    connection: useGameStore((state) => state.connection),
    recoveryNotice: useGameStore((state) => state.recoveryNotice),
    commandError: useGameStore((state) => state.commandError),
    clearCommandError: () => clearCommandError(null),
    pendingActionId: useGameStore((state) => state.pendingActionId),
    gateway,
  };
  return (
    <BrowserRouter>
      <App model={model} runtime={runtime} />
    </BrowserRouter>
  );
}
