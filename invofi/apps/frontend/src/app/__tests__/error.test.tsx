import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
// `render` wraps in NextIntlClientProvider — the error boundary reads its
// copy from the message catalogue (issue #227).
import { render } from '@/test/intl';
import type { ComponentType } from 'react';

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

type ErrorProps = { error: Error & { digest?: string }; reset: () => void };

/**
 * Renders the route error boundary (src/app/error.tsx).
 *
 * NOTE: it is loaded via `vi.resetModules()` + a dynamic `import()` rather
 * than a static import. `error.tsx` is a Next.js app-router special file and,
 * when pulled in through this repo's Vitest setup as a statically-imported
 * module, its React hooks resolve against a duplicate React instance (an
 * "Invalid hook call" / `useEffect` on null error). The dynamic-import pattern
 * is the one already used by `src/app/settings/__tests__/page.test.tsx` and
 * loads the module through the same runtime path as the component under test.
 */
async function renderErrorBoundary(error: Error, reset = vi.fn()) {
  vi.resetModules();
  const { default: ErrorBoundary } = await import('../error');
  const C = ErrorBoundary as ComponentType<ErrorProps>;
  return render(<C error={error} reset={reset} />);
}

describe('app/error.tsx — route-level error boundary', () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    window.localStorage.clear();
  });

  it('renders a friendly message when a page throws', async () => {
    await renderErrorBoundary(new Error('boom'));

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText('An unexpected error occurred. Please try again.'),
    ).toBeInTheDocument();
    // The raw error message is not exposed in non-development builds.
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('renders both a Retry and a Try again recovery action', async () => {
    await renderErrorBoundary(new Error('boom'));

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
  });

  it('Retry triggers router.refresh', async () => {
    await renderErrorBoundary(new Error('boom'));

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('Try again clears cached client state and calls reset', async () => {
    const reset = vi.fn();
    window.localStorage.setItem('invofi-draft', '{"amount":"12.50"}');
    window.localStorage.setItem('invofi-view', '"list"');

    await renderErrorBoundary(new Error('boom'), reset);
    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('invofi-draft')).toBeNull();
    expect(window.localStorage.getItem('invofi-view')).toBeNull();
  });
});