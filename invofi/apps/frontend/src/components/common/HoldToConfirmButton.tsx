'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const HOLD_DURATION_DEFAULT = 1500;
/** ~50 progress updates per second, which is smooth without being wasteful. */
const TICK_MS = 30;

interface HoldToConfirmButtonProps {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
  /** Milliseconds the button must be held. */
  holdDuration?: number;
}

/**
 * A confirm button that only fires after a deliberate press-and-hold.
 *
 * Extracted from `ConfirmDialog` so `SimulateConfirm` can offer the same
 * safeguard on irreversible actions (cancel an invoice, reclaim a defaulted
 * offer) instead of reimplementing the timer, the progress ring and the
 * screen-reader announcements a second time.
 */
export function HoldToConfirmButton({
  label,
  onConfirm,
  disabled = false,
  variant = 'default',
  holdDuration = HOLD_DURATION_DEFAULT,
}: HoldToConfirmButtonProps) {
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const t = useTranslations('Common.hold');
  const [announcement, setAnnouncement] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(0);
  const announcedRef = useRef(false);

  const clearHold = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setHoldProgress(0);
    setIsHolding(false);
    progressRef.current = 0;
    announcedRef.current = false;
  }, []);

  // A pointer released outside the window would otherwise leave the interval
  // running after unmount.
  useEffect(() => clearHold, [clearHold]);

  const handlePointerDown = useCallback(() => {
    if (disabled) return;
    setIsHolding(true);
    progressRef.current = 0;
    announcedRef.current = false;
    setAnnouncement(t('start'));

    const step = (TICK_MS / holdDuration) * 100;
    timerRef.current = setInterval(() => {
      progressRef.current += step;
      setHoldProgress(progressRef.current);

      if (progressRef.current >= 50 && !announcedRef.current) {
        announcedRef.current = true;
        setAnnouncement(t('almost'));
      }

      if (progressRef.current >= 100) {
        clearHold();
        onConfirm();
      }
    }, TICK_MS);
  }, [disabled, holdDuration, clearHold, onConfirm, t]);

  const abortHold = useCallback(() => {
    if (isHolding && progressRef.current < 100) {
      clearHold();
      setAnnouncement(t('cancelled'));
    }
  }, [isHolding, clearHold, t]);

  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (holdProgress / 100) * circumference;

  return (
    <>
      <div aria-live="polite" className="sr-only" role="status">
        {announcement}
      </div>
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={abortHold}
        onPointerLeave={abortHold}
        onPointerCancel={abortHold}
        className={cn(
          'relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-md px-4 py-2 text-sm font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'select-none',
          variant === 'destructive'
            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            : 'bg-primary text-primary-foreground hover:bg-primary/90',
          isHolding && 'cursor-grabbing',
          disabled && 'pointer-events-none opacity-50',
        )}
        style={{ touchAction: 'none' }}
        disabled={disabled}
      >
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="20" r={radius} fill="none" stroke="currentColor" strokeWidth="3" opacity="0.2" />
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
        <span className="relative z-10">{isHolding ? `${Math.round(holdProgress)}%` : label}</span>
      </button>
    </>
  );
}
