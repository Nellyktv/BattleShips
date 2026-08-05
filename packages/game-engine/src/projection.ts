import type { Preset } from '@battleships/contracts';
import type { PrivateBattleState, PrivatePlayer, Shot } from './battle.js';
import type { PlacementFleet } from './types.js';

export interface PublicPlayerProjection {
  readonly playerId: string;
  readonly name: string;
  readonly fleet: PlacementFleet;
}

export interface PublicOpponentProjection {
  readonly playerId: string;
  readonly name: string;
  readonly sunkShips: PlacementFleet;
  readonly fleet?: PlacementFleet;
}

export interface PublicBattleProjection {
  readonly preset: Preset;
  readonly phase: 'battle' | 'complete';
  readonly turnPlayerId: string | null;
  readonly winnerPlayerId: string | null;
  readonly self: PublicPlayerProjection;
  readonly opponent: PublicOpponentProjection;
  readonly shots: readonly Shot[];
  readonly opponentShots: readonly Shot[];
}

const publicPlayer = (
  player: PrivatePlayer,
  fleet: PlacementFleet,
): PublicPlayerProjection => ({
  playerId: player.playerId,
  name: player.name,
  fleet,
});

const publicOpponent = (
  player: PrivatePlayer,
  sunkShips: PlacementFleet,
  phase: PrivateBattleState['phase'],
): PublicOpponentProjection => ({
  playerId: player.playerId,
  name: player.name,
  sunkShips,
  ...(phase === 'complete' ? { fleet: player.fleet } : {}),
});

export const projectBattle = (
  state: PrivateBattleState,
  viewerId: string,
): PublicBattleProjection => {
  const viewer = state.players.find(({ playerId }) => playerId === viewerId);
  const opponent = state.players.find(({ playerId }) => playerId !== viewerId);
  if (!viewer || !opponent) throw new Error('viewer must belong to the battle');
  const viewerShots = state.shots.filter(
    ({ shooterId }) => shooterId === viewerId,
  );
  const opponentShots = state.shots.filter(
    ({ shooterId }) => shooterId === opponent.playerId,
  );
  const sunkOpponentShips = opponent.fleet.filter(({ cells }) =>
    cells.every((cell) => viewerShots.some((shot) => shot.coordinate === cell)),
  );
  return {
    preset: state.preset,
    phase: state.phase,
    turnPlayerId: state.turnPlayerId,
    winnerPlayerId: state.winnerPlayerId,
    self: publicPlayer(viewer, viewer.fleet),
    opponent: publicOpponent(opponent, sunkOpponentShips, state.phase),
    shots: viewerShots,
    opponentShots,
  };
};

export const projectGame = projectBattle;
