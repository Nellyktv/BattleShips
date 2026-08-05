import express, { type Express } from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';

export interface HttpOptions {
  readonly production?: boolean;
  readonly staticDir?: string;
}

export function createHttpApp(options: HttpOptions = {}): Express {
  const app = express();
  app.get('/health', (_request, response) => response.json({ ok: true }));

  const staticDir =
    options.staticDir ?? path.resolve(process.cwd(), 'apps/web/dist');
  if (options.production && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('/{*splat}', (_request, response) =>
      response.sendFile(path.join(staticDir, 'index.html')),
    );
  }
  return app;
}
