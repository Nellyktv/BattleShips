import { useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  presets,
  type PlacementShip,
  type Preset,
} from '@battleships/contracts';
import { Board } from '../board/Board.js';
import { BOARD_CELL_SIZES } from '../board/board-layout.js';
import {
  createDeploymentController,
  type DeploymentController,
  type DeploymentResult,
} from './deployment-controller.js';
import { FleetTray } from './FleetTray.js';
import { ConnectionBanner } from '../../components/ConnectionBanner.js';
import { pointerReleaseToCell } from './deployment-coordinate.js';

const EMPTY_FLEET: readonly PlacementShip[] = [];

const draggedLength = (data: unknown): number | undefined => {
  if (typeof data !== 'object' || data === null || !('length' in data)) {
    return undefined;
  }
  const length = data.length;
  return typeof length === 'number' ? length : undefined;
};

export interface DeploymentViewProps {
  readonly preset: Preset;
  readonly initialFleet?: readonly PlacementShip[];
  readonly gameKey?: string;
  readonly phase: 'waiting' | 'deployment';
  readonly locked?: boolean;
  readonly pending?: boolean;
  readonly connected?: boolean;
  readonly onRetry?: () => void;
  readonly reconnectDeadline?: number | null;
  readonly onReady: (fleet: readonly PlacementShip[]) => void;
  readonly opponentStatus: 'waiting' | 'placing' | 'ready' | 'disconnected';
  readonly onCancel?: () => void;
  readonly onLeave?: () => void;
}

const BoardDropTarget = ({ children }: { readonly children: ReactNode }) => {
  const droppable = useDroppable({ id: 'deployment-board' });
  return (
    <div
      ref={droppable.setNodeRef}
      style={{
        display: 'flex',
        justifyContent: 'center',
        width: 'fit-content',
        maxWidth: '100%',
      }}
    >
      {children}
    </div>
  );
};

export const DeploymentView = ({
  preset,
  initialFleet,
  gameKey,
  phase,
  locked = false,
  pending = false,
  connected = true,
  onRetry = () => undefined,
  reconnectDeadline = null,
  onReady,
  opponentStatus,
  onCancel,
  onLeave,
}: DeploymentViewProps) => {
  const controllerRef = useRef<{
    readonly key: string;
    readonly controller: DeploymentController;
  } | null>(null);
  const controllerKey = `${gameKey ?? 'deployment'}:${preset}`;
  if (controllerRef.current?.key !== controllerKey) {
    controllerRef.current = {
      key: controllerKey,
      controller: createDeploymentController(
        preset,
        initialFleet ?? EMPTY_FLEET,
        Math.random,
        { locked },
      ),
    };
  }
  const controller = controllerRef.current.controller;
  const cellSize = BOARD_CELL_SIZES.deployment[preset];
  controller.syncReadyState(locked);
  const disabled = locked || pending || !connected;
  const [, redraw] = useState(0);
  const [confirming, setConfirming] = useState<'ready' | 'leave' | null>(null);
  const [feedback, setFeedback] = useState<string>();
  const sensors = useSensors(useSensor(PointerSensor));
  const redrawBoard = () => redraw((value) => value + 1);
  const showResult = (result: DeploymentResult) => {
    if (!result.valid) {
      setFeedback(`Placement rejected: ${result.reason.replaceAll('-', ' ')}`);
    } else {
      setFeedback(undefined);
    }
    redrawBoard();
  };
  const handleDragEnd = ({
    active,
    over,
    activatorEvent,
    delta,
  }: DragEndEvent) => {
    if (disabled || !over || over.id !== 'deployment-board') return;
    const length = draggedLength(active.data.current);
    if (typeof length !== 'number') return;
    const cell = pointerReleaseToCell(
      activatorEvent,
      delta,
      over.rect,
      presets[preset].boardSize,
      cellSize,
    );
    if (!cell) return;
    showResult(controller.place(length, cell));
  };
  const ready = () => {
    if (disabled || !controller.canReady()) return;
    const result = controller.confirmReady();
    if (result.ok && result.fleet) {
      onReady(result.fleet);
      redrawBoard();
    }
    setConfirming(null);
  };
  const leave = () => {
    if (phase === 'waiting') onCancel?.();
    else onLeave?.();
    setConfirming(null);
  };
  const fleet = controller.getFleet();
  const statusLabel =
    phase === 'waiting'
      ? 'Waiting for opponent'
      : opponentStatus === 'disconnected'
        ? 'Disconnected'
        : `Opponent ${opponentStatus}`;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <Stack
        sx={{
          background: '#061321',
          color: '#d8eef1',
          minHeight: '100dvh',
          boxSizing: 'border-box',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 2, md: 3 },
        }}
      >
        <Stack
          sx={{
            width: 'fit-content',
            maxWidth: '100%',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Stack sx={{ alignItems: 'center', gap: 1 }}>
            <Typography variant="h4">Deploy your fleet</Typography>
            <Typography color="text.secondary">{statusLabel}</Typography>
          </Stack>
          <Stack
            sx={{
              width: '100%',
              height: 80,
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
            }}
          >
            {!connected ||
            (phase === 'deployment' && opponentStatus === 'disconnected') ? (
              <ConnectionBanner
                deadline={reconnectDeadline}
                localDisconnected={!connected}
                onRetry={onRetry}
              />
            ) : null}
            {feedback ? (
              <Typography role="status" color="warning.main">
                {feedback}
              </Typography>
            ) : null}
          </Stack>
          <Stack
            direction="row"
            alignItems="stretch"
            gap={3}
            width="fit-content"
            maxWidth="100%"
          >
            <BoardDropTarget>
              <Board
                boardSize={presets[preset].boardSize}
                fleet={fleet}
                cellSize={cellSize}
                showShipNumbers={true}
                onShipMove={
                  disabled
                    ? undefined
                    : (shipIndex, column, row) =>
                        showResult(controller.move(shipIndex, { column, row }))
                }
              />
            </BoardDropTarget>
            <Paper
              elevation={0}
              sx={{
                width: 280,
                flexShrink: 0,
                boxSizing: 'border-box',
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                alignSelf: 'stretch',
                background: '#0b2238',
                color: '#d8eef1',
                border: '1px solid #31516b',
              }}
            >
              <Typography variant="overline" color="text.secondary">
                Fleet controls
              </Typography>
              <Divider sx={{ borderColor: '#31516b' }} />
              <Stack
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 1,
                }}
              >
                {fleet.map((ship, index) => (
                  <Button
                    key={`rotate-${index}`}
                    disabled={disabled}
                    size="small"
                    variant="outlined"
                    onClick={() => showResult(controller.rotate(index))}
                    sx={{
                      minWidth: 0,
                      px: 1,
                      fontSize: '0.7rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {`Rotate ${String(index + 1).padStart(2, '0')} · ${ship.length} cells`}
                  </Button>
                ))}
              </Stack>
              <FleetTray
                shipLengths={presets[preset].shipLengths}
                placedLengths={fleet.map(({ length }) => length)}
                disabled={disabled}
              />
              <Stack
                direction="row"
                flexWrap="wrap"
                gap={1}
                sx={{ marginTop: 'auto' }}
              >
                <Button
                  disabled={disabled}
                  size="small"
                  onClick={() => showResult(controller.randomize())}
                >
                  Randomize
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  disabled={disabled || !controller.canReady()}
                  onClick={() => setConfirming('ready')}
                >
                  Ready
                </Button>
                <Button
                  color="inherit"
                  size="small"
                  disabled={disabled}
                  onClick={() =>
                    phase === 'waiting' ? onCancel?.() : setConfirming('leave')
                  }
                >
                  {phase === 'waiting' ? 'Cancel' : 'Leave'}
                </Button>
              </Stack>
            </Paper>
          </Stack>
        </Stack>
        <Dialog open={confirming !== null} onClose={() => setConfirming(null)}>
          <DialogTitle>
            {confirming === 'leave' ? 'Leave this game?' : 'Confirm ready'}
          </DialogTitle>
          <DialogContent>
            {confirming === 'leave'
              ? 'Your opponent will be notified that you left.'
              : 'Lock this fleet and become ready?'}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirming(null)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={confirming === 'leave' ? leave : ready}
            >
              Confirm
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </DndContext>
  );
};

export default DeploymentView;
