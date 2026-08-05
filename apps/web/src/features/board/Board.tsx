import { useMemo, type ReactNode } from 'react';
import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type { PlacementShip } from '@battleships/contracts';
import { BOARD_ORIGIN, coordinateToCell, pointToCell } from './coordinates.js';

export interface BoardProps {
  readonly boardSize: number;
  readonly fleet: readonly PlacementShip[];
  readonly cellSize?: number;
  readonly showShipNumbers?: boolean;
  readonly onShipMove?: (
    shipIndex: number,
    column: number,
    row: number,
  ) => void;
  readonly onCellPointerDown?: (column: number, row: number) => void;
  readonly onCellPointerUp?: (column: number, row: number) => void;
  readonly marks?: readonly BoardMark[];
  readonly outlinedShips?: readonly PlacementShip[];
}

export interface BoardMark {
  readonly coordinate: string;
  readonly result: 'miss' | 'hit' | 'sunk';
}

const naval = {
  board: '#081a2c',
  grid: '#31516b',
  label: '#8ea7b8',
  ship: '#2c7890',
  shipStroke: '#75c7d3',
};

export const Board = ({
  boardSize,
  fleet,
  cellSize = 44,
  showShipNumbers = false,
  onShipMove,
  onCellPointerDown,
  onCellPointerUp,
  marks = [],
  outlinedShips = [],
}: BoardProps) => {
  const pixels = boardSize * cellSize;
  const shipGroups = useMemo(
    () =>
      fleet.map((ship, shipIndex) => ({
        shipIndex,
        cells: ship.cells.map(coordinateToCell),
      })),
    [fleet],
  );
  const grid = Array.from({ length: boardSize + 1 }, (_, index) => index);
  const markShapes: ReactNode[] = [];
  marks.forEach(({ coordinate, result }) => {
    const { column, row } = coordinateToCell(coordinate);
    const x = column * cellSize + cellSize / 2;
    const y = row * cellSize + cellSize / 2;
    if (result === 'miss') {
      markShapes.push(
        <Circle
          key={`mark-${coordinate}`}
          x={x}
          y={y}
          radius={6}
          fill="#8ea7b8"
          stroke="#d8eef1"
          strokeWidth={2}
        />,
      );
      return;
    }
    markShapes.push(
      <Line
        key={`mark-${coordinate}-a`}
        points={[x - 9, y - 9, x + 9, y + 9]}
        stroke={result === 'sunk' ? '#ffbd69' : '#ff6b6b'}
        strokeWidth={4}
        lineCap="round"
      />,
      <Line
        key={`mark-${coordinate}-b`}
        points={[x + 9, y - 9, x - 9, y + 9]}
        stroke={result === 'sunk' ? '#ffbd69' : '#ff6b6b'}
        strokeWidth={4}
        lineCap="round"
      />,
    );
  });
  const sunkOutlines = outlinedShips.flatMap((ship, shipIndex) =>
    ship.cells.map((coordinate, cellIndex) => {
      const { column, row } = coordinateToCell(coordinate);
      return (
        <Rect
          key={`outline-${shipIndex}-${cellIndex}`}
          x={column * cellSize + 2}
          y={row * cellSize + 2}
          width={cellSize - 4}
          height={cellSize - 4}
          stroke="#ffbd69"
          strokeWidth={3}
          dash={[6, 3]}
          cornerRadius={4}
        />
      );
    }),
  );
  const children = [
    ...grid.map((index) => (
      <Line
        key={`v-${index}`}
        points={[index * cellSize, 0, index * cellSize, pixels]}
        stroke={naval.grid}
        strokeWidth={1}
      />
    )),
    ...grid.map((index) => (
      <Line
        key={`h-${index}`}
        points={[0, index * cellSize, pixels, index * cellSize]}
        stroke={naval.grid}
        strokeWidth={1}
      />
    )),
    ...shipGroups.map(({ shipIndex, cells: shipCells }) => (
      <Group
        key={`ship-${shipIndex}`}
        x={shipCells[0] ? shipCells[0].column * cellSize : 0}
        y={shipCells[0] ? shipCells[0].row * cellSize : 0}
        draggable={Boolean(onShipMove)}
        onDragEnd={(event) => {
          const position = event.target.position();
          onShipMove?.(
            shipIndex,
            Math.round(position.x / cellSize),
            Math.round(position.y / cellSize),
          );
          event.target.position({ x: 0, y: 0 });
        }}
      >
        {shipCells.map(({ column, row }, cellIndex) => (
          <Rect
            key={`ship-${shipIndex}-${cellIndex}`}
            x={(column - (shipCells[0]?.column ?? 0)) * cellSize + 3}
            y={(row - (shipCells[0]?.row ?? 0)) * cellSize + 3}
            width={cellSize - 6}
            height={cellSize - 6}
            fill={naval.ship}
            stroke={naval.shipStroke}
            cornerRadius={3}
          />
        ))}
        {showShipNumbers ? (
          <Text
            x={3}
            y={Math.max(3, cellSize / 2 - 8)}
            width={cellSize - 6}
            text={String(shipIndex + 1).padStart(2, '0')}
            fill="#f3fbff"
            fontFamily="monospace"
            fontSize={16}
            fontStyle="bold"
            align="center"
            listening={false}
          />
        ) : null}
      </Group>
    )),
    ...sunkOutlines,
    ...markShapes,
    ...Array.from({ length: boardSize }, (_, index) => (
      <Text
        key={`column-${index}`}
        x={index * cellSize + 5}
        y={-18}
        text={String.fromCharCode(65 + index)}
        fill={naval.label}
        fontSize={12}
      />
    )),
    ...Array.from({ length: boardSize }, (_, index) => (
      <Text
        key={`row-${index}`}
        x={-18}
        y={index * cellSize + 5}
        text={String(index + 1)}
        fill={naval.label}
        fontSize={12}
      />
    )),
  ];

  return (
    <Stage width={pixels + BOARD_ORIGIN.x} height={pixels + BOARD_ORIGIN.y}>
      <Layer>
        <Group
          x={BOARD_ORIGIN.x}
          y={BOARD_ORIGIN.y}
          onMouseDown={(event) => {
            const position = event.target.getStage()?.getPointerPosition();
            if (!position) return;
            const cell = pointToCell(
              position,
              boardSize,
              cellSize,
              BOARD_ORIGIN,
            );
            if (cell) onCellPointerDown?.(cell.column, cell.row);
          }}
          onMouseUp={(event) => {
            const position = event.target.getStage()?.getPointerPosition();
            if (!position) return;
            const cell = pointToCell(
              position,
              boardSize,
              cellSize,
              BOARD_ORIGIN,
            );
            if (cell) onCellPointerUp?.(cell.column, cell.row);
          }}
        >
          <Rect x={0} y={0} width={pixels} height={pixels} fill={naval.board} />
          {children}
        </Group>
      </Layer>
    </Stage>
  );
};
