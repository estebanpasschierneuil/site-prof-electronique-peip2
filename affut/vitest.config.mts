import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path('./src'),
      // `server-only` n'existe que pour le bundler de Next : neutre hors de lui.
      'server-only': path('./tests/stubs/server-only.ts'),
    },
  },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60_000, env: { PGLITE_DIR: 'memory', DEMO_MODE: 'true' } },
});
