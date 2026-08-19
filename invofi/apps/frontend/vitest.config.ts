import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // The rest of the codebase writes components with the automatic JSX
  // runtime (no `import React from 'react'` needed — see e.g.
  // src/components/common/EmptyState.tsx), matching Next.js's default. Vite's
  // esbuild otherwise falls back to the classic transform (`React.createElement`
  // with React expected in scope) since tsconfig.json's `"jsx": "preserve"`
  // isn't one of the react-jsx/react-jsxdev values esbuild auto-detects.
  // Pin it explicitly so component tests (#223) don't need React imports.
  esbuild: {
    jsx: 'automatic',
  },
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
      // @invofi/sdk is consumed from source via tsconfig paths (see
      // tsconfig.json + next.config.mjs); mirror that here so Vitest can
      // resolve it too (#223).
      '@invofi/sdk': path.resolve(__dirname, '../sdk/src/index.ts'),
      // The SDK's own node_modules isn't installed in CI, so its
      // `@stellar/stellar-sdk` import must resolve to this app's copy —
      // same reasoning as the webpack alias in next.config.mjs, mirrored
      // here for Vitest.
      '@stellar/stellar-sdk': path.resolve(__dirname, 'node_modules/@stellar/stellar-sdk'),
    },
  },
});
