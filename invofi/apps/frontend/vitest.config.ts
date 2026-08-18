import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Unit tests only — the e2e/ directory is Playwright, not Vitest.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/lib/formatters.ts',
        'src/lib/utils.ts',
        'src/lib/csv.ts',
        'src/lib/constants.ts',
        'src/hooks/useDebounce.ts',
        'src/hooks/useLocalStorage.ts',
        'src/hooks/useMediaQuery.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@invofi/sdk': path.resolve(__dirname, '../sdk/src/index.ts'),
    },
  },
});
