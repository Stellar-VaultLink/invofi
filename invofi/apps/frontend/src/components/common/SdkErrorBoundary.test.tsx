import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ContractError, ContractErrorType } from '@invofi/sdk';
import { SdkErrorBoundary } from './SdkErrorBoundary';

/** Throws once on mount, then renders normally after `SdkErrorBoundary` resets it. */
function Bomb({ error, shouldThrow = true }: { error: Error; shouldThrow?: boolean }) {
  if (shouldThrow) throw error;
  return <div>recovered</div>;
}

describe('SdkErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    render(
      <SdkErrorBoundary>
        <div>all good</div>
      </SdkErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('shows the recovery message and action when a ContractError with recovery is thrown', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const err = new ContractError(
      5,
      ContractErrorType.INSUFFICIENT_BALANCE,
      'The account does not have sufficient balance to complete this transaction.',
      { message: 'Add funds to your wallet and try again.', action: 'Add funds' },
    );

    render(
      <SdkErrorBoundary>
        <Bomb error={err} />
      </SdkErrorBoundary>,
    );

    expect(screen.getByText('Add funds to your wallet and try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows a link when the recovery suggestion includes a url', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const err = new ContractError(
      7,
      ContractErrorType.ALREADY_EXISTS,
      'A resource with this ID already exists.',
      { message: 'Use a different ID.', action: 'View existing', url: 'https://example.com/lookup' },
    );

    render(
      <SdkErrorBoundary>
        <Bomb error={err} />
      </SdkErrorBoundary>,
    );

    const link = screen.getByRole('link', { name: 'View existing' });
    expect(link).toHaveAttribute('href', 'https://example.com/lookup');
  });

  it('falls back to the error message when a ContractError has no recovery suggestion', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const err = new ContractError(999999, ContractErrorType.UNKNOWN, 'Contract call failed: mystery error');

    render(
      <SdkErrorBoundary>
        <Bomb error={err} />
      </SdkErrorBoundary>,
    );

    expect(screen.getByText('Contract call failed: mystery error')).toBeInTheDocument();
  });

  it('renders a graceful generic fallback for a plain (non-SDK) error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <SdkErrorBoundary>
        <Bomb error={new Error('boom, totally unrelated to the SDK')} />
      </SdkErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('boom, totally unrelated to the SDK')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('calls onReset and shows recovered content when "Try again" is clicked after a real error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReset = vi.fn();

    // Bomb throws on its first render; clicking "Try again" must call
    // onReset (which flips shouldThrow to false here, simulating a caller
    // that clears whatever caused the error) and then re-render children
    // instead of the fallback.
    function Wrapper() {
      const [shouldThrow, setShouldThrow] = useState(true);
      return (
        <SdkErrorBoundary
          onReset={() => {
            onReset();
            setShouldThrow(false);
          }}
        >
          <Bomb error={new Error('one-time failure')} shouldThrow={shouldThrow} />
        </SdkErrorBoundary>
      );
    }

    render(<Wrapper />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByText('recovered')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.getByText('recovered')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('supports a custom fallback render prop', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const err = new ContractError(2, ContractErrorType.NOT_FOUND, 'No invoice found.');

    render(
      <SdkErrorBoundary fallback={(error, reset) => (
        <div>
          <span>custom fallback: {error.message}</span>
          <button onClick={reset}>reset-custom</button>
        </div>
      )}
      >
        <Bomb error={err} />
      </SdkErrorBoundary>,
    );

    expect(screen.getByText('custom fallback: No invoice found.')).toBeInTheDocument();
  });
});
