import React, { type ReactNode } from 'react';
import type { GameSnapshot, Snapshot } from '@battleships/contracts';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';

export type RouteSnapshot = Pick<
  GameSnapshot,
  'kind' | 'gameId' | 'previousGameId'
>;
export type GameRouteResult =
  { redirect: '/lobby'; message: string } | { snapshot: RouteSnapshot };
export function resolveGameRoute(
  snapshot: RouteSnapshot | undefined,
  gameId: string,
): GameRouteResult {
  return snapshot?.kind === 'game' &&
    (snapshot.gameId === gameId || snapshot.previousGameId === gameId)
    ? { snapshot }
    : { redirect: '/lobby', message: 'That game is no longer available.' };
}

export function authoritativePath(snapshot: RouteSnapshot | Snapshot): string {
  return snapshot.kind === 'game' ? `/games/${snapshot.gameId}` : '/lobby';
}

export function needsAuthoritativeNavigation(
  currentPathname: string,
  desiredPathname: string,
): boolean {
  return currentPathname !== desiredPathname;
}

export function authoritativeTransition(
  currentPathname: string,
  desiredPathname: string,
  currentState: unknown,
  authoritativeSnapshot?: Snapshot | RouteSnapshot,
): { pathname: string; replace: true; state?: unknown } | null {
  if (!needsAuthoritativeNavigation(currentPathname, desiredPathname)) {
    return null;
  }
  const currentGameId = gameIdFromPath(currentPathname);
  const desiredGameId = gameIdFromPath(desiredPathname);
  if (
    (currentGameId &&
      (!authoritativeSnapshot ||
        authoritativeSnapshot.kind !== 'game' ||
        (authoritativeSnapshot.gameId !== currentGameId &&
          !isRematchReplacement(
            authoritativeSnapshot,
            currentGameId,
            desiredGameId,
          )))) ||
    (currentPathname === '/lobby' &&
      desiredGameId &&
      hasRouteMessage(currentState))
  ) {
    return null;
  }
  return desiredPathname === '/lobby' && currentState != null
    ? { pathname: desiredPathname, replace: true, state: currentState }
    : { pathname: desiredPathname, replace: true };
}

function isRematchReplacement(
  snapshot: Snapshot | RouteSnapshot,
  currentGameId: string,
  desiredGameId: string | undefined,
): boolean {
  return (
    snapshot.kind === 'game' &&
    snapshot.gameId === desiredGameId &&
    snapshot.previousGameId === currentGameId
  );
}

function gameIdFromPath(pathname: string): string | undefined {
  return /^\/games\/([^/]+)$/.exec(pathname)?.[1];
}

function hasRouteMessage(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'message' in state &&
    typeof state.message === 'string'
  );
}
export function AppRoutes({
  welcome,
  lobby,
  game,
  gameSnapshot,
}: {
  welcome: ReactNode;
  lobby: ReactNode;
  game: ReactNode;
  gameSnapshot?: RouteSnapshot;
}) {
  return (
    <Routes>
      <Route path="/" element={welcome} />
      <Route path="/lobby" element={lobby} />
      <Route
        path="/games/:gameId"
        element={<AuthorizedGameRoute snapshot={gameSnapshot} game={game} />}
      />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

function AuthorizedGameRoute({
  snapshot,
  game,
}: {
  snapshot?: RouteSnapshot;
  game: ReactNode;
}) {
  const { gameId = '' } = useParams();
  const result = resolveGameRoute(snapshot, gameId);
  if ('redirect' in result) {
    return (
      <Navigate
        replace
        state={{ message: result.message }}
        to={result.redirect}
      />
    );
  }
  return game;
}
