'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  loading?: boolean;
  /** When true, the confirm button requires pressing and holding ~1.5s to trigger onConfirm */
  holdToConfirm?: boolean;
  /** Duration in ms that the button must be held (default: 1500) */
  holdDuration?: number;
}

const HOLD_DURATION_DEFAULT = 1500;

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  loading = false,
  holdToConfirm = false,
  holdDuration = HOLD_DURATION_DEFAULT,
}: ConfirmDialogProps) {
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(0);
  const announcedRef = useRef(false);

  const clearHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldProgress(0);
    setIsHolding(false);
    progressRef.current = 0;
    announcedRef.current = false;
  }, []);

  const handlePointerDown = useCallback(() => {
    if (loading) return;
    setIsHolding(true);
    progressRef.current = 0;
    announcedRef.current = false;
    setAnnouncement('Hold to confirm');

    const interval = 30; // ~50 updates per second for smooth animation
    const step = (interval / holdDuration) * 100;

    holdTimerRef.current = setInterval(() => {
      progressRef.current += step;
      setHoldProgress(progressRef.current);

      // Announce at 50% for screen reader awareness
      if (progressRef.current >= 50 && !announcedRef.current) {
        announcedRef.current = true;
        setAnnouncement('Hold a little longer to confirm');
      }

      if (progressRef.current >= 100) {
        clearHold();
        onConfirm();
      }
    }, interval);
  }, [loading, holdDuration, clearHold, onConfirm]);

  const handlePointerUp = useCallback(() => {
    if (isHolding && progressRef.current < 100) {
      clearHold();
      setAnnouncement('Confirmation cancelled');
    }
  }, [isHolding, clearHold]);

  const handlePointerLeave = useCallback(() => {
    if (isHolding && progressRef.current < 100) {
      clearHold();
      setAnnouncement('Confirmation cancelled');
    }
  }, [isHolding, clearHold]);

  // Reset when dialog opens/closes
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        clearHold();
        setAnnouncement('');
      }
      onOpenChange(newOpen);
    },
    [clearHold, onOpenChange],
  );

  // Circle circumference for progress ring
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (holdProgress / 100) * circumference;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {/* Screen reader announcement */}
        <div aria-live="polite" className="sr-only" role="status">
          {announcement}
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>

          {holdToConfirm && !loading ? (
            <button
              type="button"
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
              onPointerCancel={handlePointerUp}
              className={cn(
                'relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-md px-4 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'select-none',
                variant === 'destructive'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
                isHolding && 'cursor-grabbing',
              )}
              style={{ touchAction: 'none' }}
              disabled={loading}
            >
              {/* Progress ring */}
              <svg
                className="absolute inset-0 h-full w-full -rotate-90"
                viewBox="0 0 40 40"
                aria-hidden="true"
              >
                <circle
                  cx="20"
                  cy="20"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  opacity="0.2"
                />
                <circle
                  cx="20"
                  cy="20"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  className="transition-[stroke-dashoffset] duration-75"
                />
              </svg>

              {/* Text */}
              <span className="relative z-10">
                {isHolding
                  ? `${Math.round(holdProgress)}%`
                  : confirmLabel}
              </span>
            </button>
          ) : (
            <Button
              variant={variant === 'destructive' ? 'destructive' : 'default'}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? 'Processing...' : confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}