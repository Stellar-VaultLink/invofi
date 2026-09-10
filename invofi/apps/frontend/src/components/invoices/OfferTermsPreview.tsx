'use client';

import { Info, AlertTriangle } from 'lucide-react';
import { computeOfferTerms, formatPct, formatMoney } from '@/lib/offerTerms';

interface OfferTermsPreviewProps {
  amount: string;
  rateBps: number;
  durationDays: number;
  currency: string;
}

/**
 * Live preview panel shown inside the offer form.
 * Computes annualized APR/APY and projected total repayment as the user types,
 * mirroring the contract's simple-interest math. Flags out-of-range values inline.
 */
export function OfferTermsPreview({
  amount,
  rateBps,
  durationDays,
  currency,
}: OfferTermsPreviewProps) {
  const terms = computeOfferTerms(amount, rateBps, durationDays);

  if (!terms) {
    // No valid principal yet — hint the user to enter a number
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        <Info className="h-3 w-3 inline-block mr-1 -mt-0.5" />
        Enter an amount, interest rate, and duration to see a live repayment preview.
      </div>
    );
  }

  const hasWarnings = terms.rateOutOfRange || terms.durationOutOfRange;

  return (
    <div
      className={`rounded-md border p-3 space-y-1.5 text-xs ${
        hasWarnings
          ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
          : 'border-blue-100 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40'
      }`}
    >
      <p className="flex items-center gap-1 font-medium text-gray-700 dark:text-gray-300">
        <Info className="h-3 w-3" />
        Repayment Preview
      </p>

      {terms.rateOutOfRange && (
        <p className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Rate must be between 1 and 5,000 bps ({formatPct(0.01)}–{formatPct(50)}).
        </p>
      )}
      {terms.durationOutOfRange && (
        <p className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Duration must be between 1 and 365 days.
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-gray-500 dark:text-gray-400">Simple Rate</span>
        <span className="text-right font-mono tabular-nums">
          {formatPct(terms.simpleRatePct)}
        </span>

        <span className="text-gray-500 dark:text-gray-400">Interest</span>
        <span className="text-right font-mono tabular-nums">
          {formatMoney(terms.interest)} {currency}
        </span>

        <span className="text-gray-500 dark:text-gray-400 font-medium">Total Repayment</span>
        <span className="text-right font-mono tabular-nums font-medium text-gray-800 dark:text-gray-200">
          {formatMoney(terms.totalRepayment)} {currency}
        </span>

        <span className="text-gray-500 dark:text-gray-400">Annualized APR</span>
        <span className="text-right font-mono tabular-nums">
          {formatPct(terms.annualizedApr)}
        </span>

        <span className="text-gray-500 dark:text-gray-400">Annualized APY</span>
        <span className="text-right font-mono tabular-nums">
          {formatPct(terms.annualizedApy)}
        </span>
      </div>
    </div>
  );
}