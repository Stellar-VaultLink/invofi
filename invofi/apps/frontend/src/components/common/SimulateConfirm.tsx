'use client';

import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, ArrowRight, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HoldToConfirmButton } from './HoldToConfirmButton';
import { type SimulationResult } from '@/lib/simulate';

interface SimulateConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Async function that runs the simulation. Called when the dialog opens. */
  onSimulate: () => Promise<SimulationResult>;
  /** Called when the user clicks "Confirm" after reviewing simulation results. */
  onConfirm: () => void | Promise<void>;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  /**
   * Require a deliberate press-and-hold on the confirm button. Carries over
   * the safeguard `ConfirmDialog` applies to irreversible actions (cancel an
   * invoice, reclaim a defaulted offer).
   */
  holdToConfirm?: boolean;
}

export function SimulateConfirm({
  open,
  onOpenChange,
  title,
  description,
  onSimulate,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  holdToConfirm = false,
}: SimulateConfirmProps) {
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Run simulation when the dialog opens
  useEffect(() => {
    if (!open) {
      // Reset state when dialog closes
      setSimResult(null);
      setSimError(null);
      setSubmitting(false);
      return;
    }

    let cancelled = false;
    setSimLoading(true);
    setSimError(null);
    setSimResult(null);

    onSimulate()
      .then(result => {
        if (!cancelled) {
          setSimResult(result);
          setSimLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setSimError(err instanceof Error ? err.message : 'Simulation failed');
          setSimLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, onSimulate]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Errors are handled by the parent's toast
    } finally {
      setSubmitting(false);
    }
  };

  const isFailed = simResult !== null && !simResult.success;
  const isReady = simResult !== null && simResult.success;
  const canConfirm = isReady && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {simLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
            {isFailed && <AlertTriangle className="h-4 w-4 text-red-500" />}
            {isReady && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Loading state */}
          {simLoading && (
            <div className="flex flex-col items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p>Simulating transaction…</p>
              <p className="text-xs">Checking against current ledger state</p>
            </div>
          )}

          {/* Simulation error (catch block) */}
          {simError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/40">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    Simulation Failed
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">
                    {simError}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Contract-level error from simulation */}
          {isFailed && simResult.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/40">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    Transaction Would Fail
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono break-all">
                    {simResult.error}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Success — show token movements */}
          {isReady && (
            <>
              {simResult.tokenMovements.length > 0 && (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Token Movements
                  </p>
                  {simResult.tokenMovements.map((mv, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Badge variant="outline" className="shrink-0 text-xs font-mono">
                        {mv.amount} {mv.asset}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]" title={mv.from}>
                        {mv.from.slice(0, 6)}…{mv.from.slice(-4)}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]" title={mv.to}>
                        {mv.to.slice(0, 6)}…{mv.to.slice(-4)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {simResult.tokenMovements.length === 0 && (
                <div className="rounded-lg border border-border p-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>No token transfers detected — this may be a state-only change.</span>
                </div>
              )}

              {/* State changes — the ledger entries this call would write. */}
              {simResult.stateChanges.length > 0 && (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    State Changes
                  </p>
                  {simResult.stateChanges.map((change, i) => (
                    <div key={i} className="space-y-0.5">
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                          {change.type}
                        </Badge>
                        <span className="font-mono text-muted-foreground truncate" title={change.key}>
                          {change.key}
                        </span>
                      </div>
                      {change.after !== null && change.after !== change.before && (
                        <p
                          className="text-[11px] text-muted-foreground font-mono truncate pl-1"
                          title={`${change.before ?? '∅'} → ${change.after}`}
                        >
                          {change.before ?? '∅'} → {change.after}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Resource fee */}
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>Estimated resource fee</span>
                <span className="font-mono">{simResult.resourceFee} stroops</span>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {cancelLabel}
          </Button>
          {/* Hold-to-confirm still requires a clean simulation: `disabled`
              carries the same gate as the plain button. */}
          {holdToConfirm && !submitting ? (
            <HoldToConfirmButton
              label={confirmLabel}
              variant={variant}
              disabled={!canConfirm}
              onConfirm={handleConfirm}
            />
          ) : (
            <Button
              variant={variant === 'destructive' ? 'destructive' : 'default'}
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Submitting…
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
