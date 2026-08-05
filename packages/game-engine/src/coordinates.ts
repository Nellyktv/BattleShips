import { coordinateSchema, type Coordinate } from '@battleships/contracts';

export interface BoardPosition {
  readonly column: number;
  readonly row: number;
}

export const coordinateToPosition = (coordinate: Coordinate): BoardPosition => {
  if (!coordinateSchema.safeParse(coordinate).success) {
    throw new Error(`Invalid coordinate: ${coordinate}`);
  }
  const column = coordinate.charCodeAt(0) - 'A'.charCodeAt(0);
  const row = Number(coordinate.slice(1)) - 1;
  return { column, row };
};

export const positionToCoordinate = ({
  column,
  row,
}: BoardPosition): Coordinate => {
  if (
    !Number.isInteger(column) ||
    !Number.isInteger(row) ||
    column < 0 ||
    column > 11 ||
    row < 0 ||
    row > 11
  ) {
    throw new Error(`Invalid board position: ${column},${row}`);
  }
  return `${String.fromCharCode('A'.charCodeAt(0) + column)}${row + 1}`;
};
