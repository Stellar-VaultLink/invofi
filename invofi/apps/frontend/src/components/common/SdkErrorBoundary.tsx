'use client';

// ── SdkErrorBoundary — reusable error boundary for @invofi/sdk errors (#223) ──
//
// A narrower, reusable class-component error boundary for wrapping specific
// data-fetching / contract-interaction sections of the UI (a card, a form, a
// table) — NOT a replacement for `src/app/error.tsx`, which remains the
// route-level Next.js error boundary.
//
// When the caught error is a `ContractError` (or `SdkError`) from
// `@invofi/sdk`, the fallback UI surfaces its recovery suggestion
// (`message` / `action` / `url`) so the user gets an actionable next step
// instead of a raw stack trace. Any other error still renders a safe,
// generic fallback rather than crashing the surrounding page.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ContractError, SdkError } from '@invofi/sdk';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface SdkErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback renderer, given the caught error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Called when the user retries, before the boundary clears its error state. */
  onReset?: () => void;
}

interface SdkErrorBoundaryState {
  error: Error | null;
}

/** Default fallback UI shown when no custom `fallback` render prop is supplied. */
function DefaultFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const recovery = error instanceof ContractError ? error.recovery : undefined;
  const description = recovery?.message ?? error.message ?? 'An unexpected error occurred. Please try again.';

  return (
    <Alert variant="destructive" className="max-w-lg">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>
        <p className="mb-3">{description}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" onClick={onReset}>
            Try again
          </Button>
          {recovery?.url && (
            <a
              href={recovery.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium underline underline-offset-4"
            >
              {recovery.action ?? 'Learn more'}
            </a>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Class-based error boundary for wrapping SDK-driven sections of the UI.
 *
 * Usage:
 *   <SdkErrorBoundary>
 *     <InvoiceTable />
 *   </SdkErrorBoundary>
 */
export class SdkErrorBoundary extends Component<SdkErrorBoundaryProps, SdkErrorBoundaryState> {
  state: SdkErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SdkErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Non-SDK errors (render bugs, etc.) are still contained by the boundary
    // — but always logged so they aren't silently swallowed.
    const kind = error instanceof SdkError ? error.name : 'Error';
    // eslint-disable-next-line no-console
    console.error(`[SdkErrorBoundary] caught ${kind}:`, error, errorInfo.componentStack);
  }

  reset = (): void => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return <DefaultFallback error={error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}
