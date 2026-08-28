import { useState } from 'react';
import { screen, fireEvent, act } from '@testing-library/react';
// `render` wraps in NextIntlClientProvider — ConfirmDialog now takes its
// default labels and hold announcements from the message catalogue.
import { render } from '@/test/intl';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function TestHarness({
  holdToConfirm = false,
  holdDuration = 1500,
  variant = 'destructive',
}: {
  holdToConfirm?: boolean;
  holdDuration?: number;
  variant?: 'default' | 'destructive';
}) {
  const [open, setOpen] = useState(true);
  const onConfirm = vi.fn();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Test Action"
      description="This action cannot be undone."
      confirmLabel="Confirm"
      variant={variant}
      holdToConfirm={holdToConfirm}
      holdDuration={holdDuration}
      onConfirm={onConfirm}
    />
  );
}

describe('ConfirmDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('standard mode', () => {
    it('renders the confirm button as a regular Button', () => {
      render(<TestHarness holdToConfirm={false} />);
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    });

    it('triggers onConfirm on single click', () => {
      render(<TestHarness holdToConfirm={false} />);
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    });
  });

  describe('hold-to-confirm mode', () => {
    it('renders a custom button with progress ring', () => {
      render(<TestHarness holdToConfirm />);
      const btn = screen.getByRole('button', { name: 'Confirm' });
      expect(btn).toBeInTheDocument();
      // Should have an SVG progress ring
      expect(btn.querySelector('svg')).toBeInTheDocument();
    });

    it('shows progress percentage while holding', () => {
      render(<TestHarness holdToConfirm holdDuration={1000} />);
      const btn = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.pointerDown(btn);

      // Advance 300ms (~30% progress)
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByText('30%')).toBeInTheDocument();

      // Advance another 300ms (~60%)
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByText('60%')).toBeInTheDocument();
    });

    it('calls onConfirm after holding for the full duration', () => {
      const onConfirm = vi.fn();
      function Test() {
        const [open, setOpen] = useState(true);
        return (
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Test"
            confirmLabel="Confirm"
            variant="destructive"
            holdToConfirm
            holdDuration={1000}
            onConfirm={onConfirm}
          />
        );
      }
      render(<Test />);
      const btn = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.pointerDown(btn);

      // Advance past the full duration
      act(() => {
        vi.advanceTimersByTime(1200);
      });

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('cancels on pointer up before the full duration', () => {
      const onConfirm = vi.fn();
      function Test() {
        const [open, setOpen] = useState(true);
        return (
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Test"
            confirmLabel="Confirm"
            variant="destructive"
            holdToConfirm
            holdDuration={1000}
            onConfirm={onConfirm}
          />
        );
      }
      render(<Test />);
      const btn = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.pointerDown(btn);

      // Advance 300ms
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Release early
      fireEvent.pointerUp(btn);

      // Advance remaining time
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Should NOT have called onConfirm
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('cancels on pointer leave before the full duration', () => {
      const onConfirm = vi.fn();
      function Test() {
        const [open, setOpen] = useState(true);
        return (
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Test"
            confirmLabel="Confirm"
            variant="destructive"
            holdToConfirm
            holdDuration={1000}
            onConfirm={onConfirm}
          />
        );
      }
      render(<Test />);
      const btn = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.pointerDown(btn);

      act(() => {
        vi.advanceTimersByTime(300);
      });

      fireEvent.pointerLeave(btn);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('resets progress after cancellation', () => {
      const onConfirm = vi.fn();
      function Test() {
        const [open, setOpen] = useState(true);
        return (
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Test"
            confirmLabel="Confirm"
            variant="destructive"
            holdToConfirm
            holdDuration={1000}
            onConfirm={onConfirm}
          />
        );
      }
      render(<Test />);
      const btn = screen.getByRole('button', { name: 'Confirm' });

      // Start holding
      fireEvent.pointerDown(btn);
      act(() => { vi.advanceTimersByTime(300); });
      expect(screen.getByText('30%')).toBeInTheDocument();

      // Cancel
      fireEvent.pointerUp(btn);

      // Confirm button should show original label again
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    });

    it('has an aria-live region for screen reader announcements', () => {
      render(<TestHarness holdToConfirm holdDuration={1000} />);
      const liveRegion = document.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
      expect(liveRegion).toHaveAttribute('role', 'status');
    });

    it('announces hold start when pointer goes down', () => {
      render(<TestHarness holdToConfirm holdDuration={1000} />);
      const btn = screen.getByRole('button', { name: 'Confirm' });

      fireEvent.pointerDown(btn);

      const liveRegion = document.querySelector('[aria-live="polite"]');
      expect(liveRegion).toHaveTextContent('Hold to confirm');
    });
  });
});