'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Error details (message/digest) are only surfaced in development — in
// production we show a generic message so sensitive error internals are not
// leaked to end users.
const IS_DEV = process.env.NODE_ENV === 'development';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Logged so the error is not silently swallowed. Next.js surfaces this
    // console output in the dev overlay too.
    console.error(error);
  }, [error]);

  // "Retry" performs a full server round-trip re-render of the current route
  // (router.refresh), fetching fresh server components and data.
  const handleRetry = () => {
    router.refresh();
  };

  // "Try again" clears any cached client state (localStorage) before invoking
  // the route's reset(), so the retried render starts from a clean slate
  // instead of replaying stale cached data.
  const handleReset = () => {
    try {
      window.localStorage.clear();
    } catch {
      // Storage may be unavailable in some privacy modes — reset still works.
    }
    reset();
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center text-center px-4">
      <AlertTriangle
        className="h-12 w-12 mb-4 text-amber-500"
        aria-hidden="true"
      />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Something went wrong
      </h1>
      <p className="text-gray-500 mb-6 max-w-sm text-sm">
        An unexpected error occurred. Please try again.
      </p>

      {IS_DEV && (error.message || error.digest) && (
        <pre
          data-testid="error-detail"
          className="mb-6 max-w-md overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-left text-xs text-gray-700"
        >
          {error.message}
          {error.digest ? `\n\nDigest: ${error.digest}` : ''}
        </pre>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="outline" onClick={handleRetry}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
        <Button onClick={handleReset}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </div>
    </div>
  );
}