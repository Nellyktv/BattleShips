import { useEffect, useMemo, useRef } from 'react';
import type { ServerAck, ServerEvent } from '@battleships/contracts';
import {
  createGameSocketGateway,
  createWebSocket,
  type SocketBoundary,
} from './client.js';
import { useGameStore } from '../state/game-store.js';

export const useGameSocket = (url: string, socket?: SocketBoundary) => {
  const setConnection = useGameStore((state) => state.setConnection);
  const applySnapshot = useGameStore((state) => state.applySnapshot);
  const runtimeReset = useGameStore((state) => state.runtimeReset);
  const sessionReplaced = useGameStore((state) => state.sessionReplaced);
  const setPendingAction = useGameStore((state) => state.setPendingAction);
  const setCommandError = useGameStore((state) => state.setCommandError);
  const name = useGameStore((state) => state.name);
  const nameRef = useRef(name);
  nameRef.current = name;
  const socketInstance = useMemo(
    () => socket ?? createWebSocket(url),
    [socket, url],
  );
  const gateway = useMemo(
    () =>
      createGameSocketGateway(socketInstance, {
        onPending: (actionId) => setPendingAction(actionId),
        onTimeout: () => setPendingAction(null),
      }),
    [applySnapshot, setPendingAction, socketInstance],
  );

  useEffect(() => {
    setConnection('connecting');
    const cleanup = gateway.listen({
      getName: () => nameRef.current,
      onConnect: () => setConnection('connected'),
      onDisconnect: () => {
        setPendingAction(null);
        setConnection('disconnected');
      },
      onConnectError: () => setConnection('disconnected'),
      onRuntimeReset: runtimeReset,
      onEvent: (event: ServerEvent) => {
        if (event.type === 'snapshot') applySnapshot(event.snapshot);
        if (event.type === 'runtime-reset') runtimeReset();
        if (event.type === 'session-replaced') {
          sessionReplaced();
          gateway.reconnectFresh();
        }
        if (event.type === 'command-error') {
          if (event.error.code === 'not-identified') {
            runtimeReset();
          } else {
            setPendingAction(null);
            setCommandError(event.error);
          }
        }
      },
      onAck: (ack: ServerAck) => {
        if (ack.ok) {
          applySnapshot(ack.snapshot);
        } else if (ack.error.code === 'not-identified') {
          runtimeReset();
        } else {
          setPendingAction(null);
          setCommandError(ack.error);
        }
      },
    });
    gateway.connect();
    return () => {
      cleanup();
      if (!socket) socketInstance.disconnect?.();
      setPendingAction(null);
      setConnection('disconnected');
    };
  }, [
    applySnapshot,
    gateway,
    runtimeReset,
    sessionReplaced,
    setConnection,
    setCommandError,
    socket,
    socketInstance,
  ]);

  return gateway;
};
