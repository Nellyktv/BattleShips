import type {
  Coordinate,
  GameSnapshot,
  PlacementShip,
} from '@battleships/contracts';

export interface BattleController {
  readonly canShoot: (coordinate: Coordinate) => boolean;
  readonly shoot: (coordinate: Coordinate) => boolean;
}

export const createBattleController = (
  snapshot: GameSnapshot,
  pending: boolean,
  onShot: (coordinate: Coordinate) => void,
  connected = true,
): BattleController => {
  const tried = new Set(snapshot.shots.map(({ coordinate }) => coordinate));
  const canShoot = (coordinate: Coordinate) =>
    snapshot.phase === 'battle' &&
    snapshot.turnPlayerId === snapshot.self.playerId &&
    connected &&
    !pending &&
    !tried.has(coordinate);

  return {
    canShoot,
    shoot: (coordinate) => {
      if (!canShoot(coordinate)) return false;
      onShot(coordinate);
      return true;
    },
  };
};

export const countAfloatShips = (
  fleet: readonly PlacementShip[],
  shots: readonly { coordinate: Coordinate; result: 'miss' | 'hit' | 'sunk' }[],
) => {
  const hitCells = new Set(
    shots
      .filter(({ result }) => result === 'hit' || result === 'sunk')
      .map(({ coordinate }) => coordinate),
  );
  return fleet.filter((ship) => ship.cells.some((cell) => !hitCells.has(cell)))
    .length;
};

export const sunkShipsFromMarks = (
  fleet: readonly PlacementShip[],
  shots: readonly { coordinate: Coordinate; result: 'miss' | 'hit' | 'sunk' }[],
) => {
  const hitCells = new Set(
    shots
      .filter(({ result }) => result === 'hit' || result === 'sunk')
      .map(({ coordinate }) => coordinate),
  );
  return fleet.filter((ship) => ship.cells.every((cell) => hitCells.has(cell)));
};
