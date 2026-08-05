import type { ErrorCode, Snapshot } from '@battleships/contracts';

export type ConnectionState =
  'idle' | 'connecting' | 'connected' | 'disconnected';

export type RecoveryNotice = 'runtime-reset' | 'session-replaced' | null;
export type CommandError = { code: ErrorCode; message: string };

export type GameState = {
  snapshot: Snapshot | null;
  name: string;
  connection: ConnectionState;
  recoveryNotice: RecoveryNotice;
  commandError: CommandError | null;
  pendingActionId: string | null;
  applySnapshot: (snapshot: Snapshot) => void;
  setName: (name: string) => void;
  setConnection: (connection: ConnectionState) => void;
  setPendingAction: (actionId: string | null) => void;
  setCommandError: (error: CommandError | null) => void;
  runtimeReset: () => void;
  sessionReplaced: () => void;
  reset: () => void;
};
