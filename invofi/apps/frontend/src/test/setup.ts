import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  // Test files that opt into the node environment (e.g. crypto/logic suites)
  // have no DOM — skip the DOM-only teardown for them.
  if (typeof window === 'undefined') return;
  cleanup();
  window.localStorage.clear();
});
