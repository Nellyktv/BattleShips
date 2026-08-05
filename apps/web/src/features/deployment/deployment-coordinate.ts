import {
  BOARD_ORIGIN,
  pointToCell,
  type BoardCell,
  type BoardPoint,
} from '../board/coordinates.js';

interface DragDelta {
  readonly x: number;
  readonly y: number;
}

interface DropRect {
  readonly left: number;
  readonly top: number;
}

export const pointerReleaseToCell = (
  activatorEvent: Event | null,
  delta: DragDelta,
  overRect: DropRect,
  boardSize: number,
  cellSize: number,
  origin: BoardPoint = BOARD_ORIGIN,
): BoardCell | undefined => {
  if (activatorEvent?.type !== 'pointerdown') return undefined;
  const pointerEvent = activatorEvent as PointerEvent;
  if (
    !Number.isFinite(pointerEvent.clientX) ||
    !Number.isFinite(pointerEvent.clientY)
  ) {
    return undefined;
  }
  return pointToCell(
    {
      x: pointerEvent.clientX + delta.x - overRect.left,
      y: pointerEvent.clientY + delta.y - overRect.top,
    },
    boardSize,
    cellSize,
    origin,
  );
};
