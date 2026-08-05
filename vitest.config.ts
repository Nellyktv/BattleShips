import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@battleships/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url),
      ),
      '@battleships/game-engine': fileURLToPath(
        new URL('./packages/game-engine/src/index.ts', import.meta.url),
      ),
    },
  },
  test: { include: ['**/*.test.ts'] },
});
