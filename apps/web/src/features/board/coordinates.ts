import {
  coordinateToPosition,
  positionToCoordinate,
} from '@battleships/game-engine';

export interface BoardPoint {
  readonly x: number;
  readonly y: number;
}

export interface BoardCell {
  readonly column: number;
  readonly row: number;
}

export const BOARD_ORIGIN: BoardPoint = { x: 20, y: 20 };

export const pointToCell = (
  point: BoardPoint,
  boardSize: number,
  cellSize: number,
  origin: BoardPoint = { x: 0, y: 0 },
): BoardCell | undefined => {
  const boardPixels = boardSize * cellSize;
  const localPoint = {
    x: point.x - origin.x,
    y: point.y - origin.y,
  };
  if (
    localPoint.x < 0 ||
    localPoint.y < 0 ||
    localPoint.x >= boardPixels ||
    localPoint.y >= boardPixels
  ) {
    return undefined;
  }
  return {
    column: Math.floor(localPoint.x / cellSize),
    row: Math.floor(localPoint.y / cellSize),
  };
};

export const cellToCoordinate = (cell: BoardCell) => positionToCoordinate(cell);

export const coordinateToCell = (coordinate: string): BoardCell =>
  coordinateToPosition(coordinate);
