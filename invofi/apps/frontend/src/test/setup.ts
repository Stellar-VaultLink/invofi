import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  // Test files that opt into the node environment via `// @vitest-environment
  // node` (e.g. src/lib/sep10-server.test.ts, which exercises
  // @stellar/stellar-sdk's Ed25519 key generation directly) have no DOM —
  // skip the DOM-only teardown for them.
  if (typeof window === 'undefined') return;
  cleanup();
  window.localStorage.clear();
});
