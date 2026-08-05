import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createHttpApp } from './http.js';
import { SocketAdapter } from './socket/adapter.js';
import { SystemClock } from './domain/clock.js';
import { NameService } from './domain/name-service.js';
import { StatsService } from './domain/stats-service.js';
import { IdentityService } from './domain/identity-service.js';
import { GameService } from './domain/game-service.js';
import { LobbyService } from './domain/lobby-service.js';

export function createRuntime() {
  const clock = new SystemClock();
  const stats = new StatsService();
  const identities = new IdentityService(new NameService(clock), stats);
  const games = new GameService(identities, stats, clock);
  const lobby = new LobbyService(games);
  return {
    identities,
    games,
    lobby,
    runtimeId: globalThis.crypto.randomUUID(),
  };
}

export function startServer(port = Number(process.env.PORT ?? 3000)) {
  const app = createHttpApp({
    production: process.env.NODE_ENV === 'production',
  });
  const httpServer = createServer(app);
  const io = new Server(httpServer, { transports: ['websocket'] });
  const runtime = createRuntime();
  const adapter = new SocketAdapter(
    {
      identity: runtime.identities,
      lobby: runtime.lobby,
      games: runtime.games,
    },
    runtime.runtimeId,
  );
  io.on('connection', (socket) => adapter.attach(socket));
  httpServer.listen(port, () =>
    console.log(`Battleships server listening on ${port}`),
  );
  httpServer.on('error', (error) =>
    console.error('Unexpected server error', error),
  );
  return { app, httpServer, io, adapter };
}

if (import.meta.url === `file://${process.argv[1]}`) startServer();
