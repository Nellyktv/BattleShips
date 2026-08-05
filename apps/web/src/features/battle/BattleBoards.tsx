import { Stack, Typography } from '@mui/material';
import { presets, type GameSnapshot } from '@battleships/contracts';
import { Board } from '../board/Board.js';
import { BOARD_CELL_SIZES } from '../board/board-layout.js';
import { cellToCoordinate } from '../board/coordinates.js';
import {
  sunkShipsFromMarks,
  type BattleController,
} from './battle-controller.js';

type BattleSnapshot = Extract<
  GameSnapshot,
  { phase: 'battle' | 'paused' | 'complete' }
>;

export interface BattleBoardsProps {
  readonly snapshot: BattleSnapshot;
  readonly controller: BattleController;
}

export const BattleBoards = ({ snapshot, controller }: BattleBoardsProps) => {
  const boardSize = presets[snapshot.preset].boardSize;
  const cellSize = BOARD_CELL_SIZES.battle[snapshot.preset];
  const shot = (column: number, row: number) =>
    controller.shoot(cellToCoordinate({ column, row }));
  const enemyFleet =
    snapshot.phase === 'complete' ? snapshot.opponent.fleet : [];
  const enemySunkShips =
    snapshot.phase === 'complete'
      ? sunkShipsFromMarks(enemyFleet, snapshot.shots)
      : snapshot.opponent.sunkShips;
  const ownFleet = snapshot.self.fleet ?? [];
  const ownSunkShips = sunkShipsFromMarks(
    ownFleet,
    snapshot.opponentShots ?? [],
  );

  return (
    <Stack
      direction="row"
      spacing={3}
      alignItems="center"
      justifyContent="center"
      sx={{ width: '100%', maxWidth: 'max-content', flexWrap: 'nowrap' }}
    >
      <Stack spacing={1} alignItems="center" flexShrink={0}>
        <Typography variant="h6">Enemy waters</Typography>
        <Board
          boardSize={boardSize}
          cellSize={cellSize}
          fleet={enemyFleet}
          marks={snapshot.shots}
          outlinedShips={enemySunkShips}
          onCellPointerUp={snapshot.phase === 'battle' ? shot : undefined}
        />
      </Stack>
      <Stack spacing={1} alignItems="center" flexShrink={0}>
        <Typography variant="h6">Your fleet</Typography>
        <Board
          boardSize={boardSize}
          cellSize={cellSize}
          fleet={ownFleet}
          marks={snapshot.opponentShots ?? []}
          outlinedShips={ownSunkShips}
        />
      </Stack>
    </Stack>
  );
};

export default BattleBoards;
