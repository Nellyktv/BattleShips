import { useDraggable } from '@dnd-kit/core';
import { Button } from '@mui/material';

interface TrayShipProps {
  readonly length: number;
  readonly index: number;
  readonly disabled: boolean;
}

const TrayShip = ({ length, index, disabled }: TrayShipProps) => {
  const draggable = useDraggable({
    id: `tray-ship-${index}`,
    data: { length },
    disabled,
  });
  return (
    <Button
      ref={draggable.setNodeRef}
      disabled={disabled}
      variant="outlined"
      size="small"
      style={{
        ...(draggable.transform
          ? {
              transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`,
            }
          : {}),
        cursor: 'grab',
      }}
      {...draggable.attributes}
      {...draggable.listeners}
    >
      {`Ship ${length}`}
    </Button>
  );
};

export interface FleetTrayProps {
  readonly shipLengths: readonly number[];
  readonly placedLengths: readonly number[];
  readonly disabled?: boolean;
}

export const FleetTray = ({
  shipLengths,
  placedLengths,
  disabled = false,
}: FleetTrayProps) => {
  const placed = new Map<number, number>();
  for (const length of placedLengths) {
    placed.set(length, (placed.get(length) ?? 0) + 1);
  }
  return (
    <div
      style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
      aria-label="Fleet tray"
    >
      {shipLengths.map((length, index) => {
        const used = placed.get(length) ?? 0;
        if (used > 0) placed.set(length, used - 1);
        return used === 0 ? (
          <TrayShip
            key={`${length}-${index}`}
            length={length}
            index={index}
            disabled={disabled}
          />
        ) : null;
      })}
    </div>
  );
};
