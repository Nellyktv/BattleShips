import { io, type Socket } from 'socket.io-client';
import {
  commandSchema,
  serverAckSchema,
  serverEventSchema,
  type Command,
  type ServerAck,
  type ServerEvent,
  runtimeIdSchema,
  tabIdSchema,
} from '@battleships/contracts';
import {
  SERVER_RUNTIME_ID_STORAGE_KEY,
  TAB_ID_STORAGE_KEY,
} from '../state/game-store.js';
import { getSessionStorage } from '../state/session.js';

const COMMAND_TIMEOUT_MS = 5_000;

export type SocketBoundary = {
  emit: (event: string, ...args: unknown[]) => unknown;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  off: (event: string, listener: (...args: unknown[]) => void) => unknown;
  connect?: () => unknown;
  disconnect?: () => unknown;
};

export type GatewayCallbacks = {
  onPending?: (actionId: string) => void;
  onTimeout?: (actionId: string) => void;
};

export type GatewayListeners = {
  onEvent: (event: ServerEvent) => void;
  onAck: (ack: ServerAck) => void;
  getName?: () => string;
  onConnect?: () => void;
  onDisconnect?: (reason: unknown) => void;
  onConnectError?: (error: unknown) => void;
  onRuntimeReset?: () => void;
};

export { getSessionStorage } from '../state/session.js';
export { SERVER_RUNTIME_ID_STORAGE_KEY } from '../state/game-store.js';

export const getOrCreateTabId = () => {
  const storage = getSessionStorage();
  const existing = storage.getItem(TAB_ID_STORAGE_KEY);
  if (existing && tabIdSchema.safeParse(existing).success) return existing;
  const tabId =
    globalThis.crypto?.randomUUID?.() ??
    `00000000-0000-4000-8000-${Math.random().toString(16).slice(2).padStart(12, '0')}`;
  storage.setItem(TAB_ID_STORAGE_KEY, tabId);
  return tabId;
};

const getRuntimeId = () => {
  const storage = getSessionStorage();
  const runtimeId = storage.getItem(SERVER_RUNTIME_ID_STORAGE_KEY);
  if (runtimeId && runtimeIdSchema.safeParse(runtimeId).success)
    return runtimeId;
  storage.removeItem(SERVER_RUNTIME_ID_STORAGE_KEY);
  return undefined;
};

const nextActionId = () =>
  `act_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

type CommandInputWithoutActionId<T> = T extends Command
  ? Omit<T, 'actionId'>
  : never;
export type CommandInput = CommandInputWithoutActionId<Command>;

export const createWebSocket = (url: string): Socket =>
  io(url, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 14,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 30_000,
    randomizationFactor: 0,
  });

export const createGameSocketGateway = (
  socket: SocketBoundary,
  callbacks: GatewayCallbacks = {},
) => {
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  let activeActionId: string | undefined;
  let activeCommandType: Command['type'] | undefined;
  let recoveryActionId: string | undefined;

  const clearPending = () => {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = undefined;
    activeActionId = undefined;
    activeCommandType = undefined;
  };

  const requestSnapshot = () => {
    const actionId = nextActionId();
    recoveryActionId = actionId;
    const command: Command = {
      actionId,
      type: 'game.snapshot',
      payload: {},
    };
    socket.emit('command', { command });
  };

  const send = (candidate: unknown) => {
    const parsed = commandSchema.safeParse(candidate);
    if (!parsed.success) return false;
    const command = parsed.data;
    clearPending();
    recoveryActionId = undefined;
    activeActionId = command.actionId;
    activeCommandType = command.type;
    callbacks.onPending?.(command.actionId);
    pendingTimer = setTimeout(() => {
      if (activeActionId !== command.actionId) return;
      clearPending();
      callbacks.onTimeout?.(command.actionId);
      requestSnapshot();
    }, COMMAND_TIMEOUT_MS);
    socket.emit('command', { command });
    return true;
  };

  const identify = (name: string) => {
    const runtimeId = getRuntimeId();
    return send({
      actionId: nextActionId(),
      type: 'identify',
      payload: {
        name,
        tabId: getOrCreateTabId(),
        ...(runtimeId ? { runtimeId } : {}),
      },
    });
  };

  const dispatch = (input: CommandInput) =>
    send({ ...input, actionId: nextActionId() });

  const listen = ({
    onEvent,
    onAck,
    getName,
    onConnect,
    onDisconnect,
    onConnectError,
    onRuntimeReset,
  }: GatewayListeners) => {
    const eventListener = (rawEvent: unknown) => {
      const event = serverEventSchema.safeParse(rawEvent);
      if (event.success) onEvent(event.data);
    };
    const ackListener = (rawAck: unknown) => {
      const ack = serverAckSchema.safeParse(rawAck);
      if (!ack.success) return;
      const isActiveAck = ack.data.actionId === activeActionId;
      const isRecoveryAck = ack.data.actionId === recoveryActionId;
      if (!isActiveAck && !isRecoveryAck) return;
      if (isRecoveryAck) {
        recoveryActionId = undefined;
      }
      if (!isActiveAck) {
        onAck(ack.data);
        return;
      }
      const wasIdentify = activeCommandType === 'identify';
      clearPending();
      if (wasIdentify && ack.data.ok && ack.data.runtimeId) {
        getSessionStorage().setItem(
          SERVER_RUNTIME_ID_STORAGE_KEY,
          ack.data.runtimeId,
        );
      }
      if (!ack.data.ok && ack.data.error.code === 'runtime-reset') {
        getSessionStorage().removeItem(SERVER_RUNTIME_ID_STORAGE_KEY);
        onRuntimeReset?.();
      }
      onAck(ack.data);
    };
    const connectListener = () => {
      onConnect?.();
      const name = getName?.();
      if (name) identify(name);
    };
    const disconnectListener = (reason: unknown) => {
      clearPending();
      onDisconnect?.(reason);
    };
    const connectErrorListener = (error: unknown) => onConnectError?.(error);
    socket.on('event', eventListener);
    socket.on('ack', ackListener);
    socket.on('connect', connectListener);
    socket.on('disconnect', disconnectListener);
    socket.on('connect_error', connectErrorListener);
    return () => {
      socket.off('event', eventListener);
      socket.off('ack', ackListener);
      socket.off('connect', connectListener);
      socket.off('disconnect', disconnectListener);
      socket.off('connect_error', connectErrorListener);
      clearPending();
      recoveryActionId = undefined;
    };
  };

  const connect = () => socket.connect?.();
  const reconnectFresh = () => {
    socket.disconnect?.();
    socket.connect?.();
  };
  const retryNow = connect;

  return {
    identify,
    dispatch,
    send,
    listen,
    requestSnapshot,
    connect,
    reconnectFresh,
    retryNow,
  };
};
