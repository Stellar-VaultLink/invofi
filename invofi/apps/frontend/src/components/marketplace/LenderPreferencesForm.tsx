'use client';

/**
 * LenderPreferencesForm
 *
 * A dialog-based form that lets a lender configure their matching preferences.
 * Uses React Hook Form + Zod for type-safe validation and renders a
 * shadcn/ui Dialog so it can be triggered from a toolbar button in the
 * marketplace.
 */

import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Settings2, RotateCcw, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { STROOPS_PER_XLM } from '@/lib/constants';
import type { LenderPreferences } from '@/types/matching';
import type { CurrencyPreference, RiskProfile } from '@/types/matching';

// ── Validation schema ─────────────────────────────────────────────────────────

const schema = z.object({
  riskProfile: z.enum(['conservative', 'moderate', 'aggressive']),
  currencyPreference: z.enum(['XLM', 'USDC', 'both']),
  minYieldPercent: z
    .number({ invalid_type_error: 'Enter a number' })
    .min(0, 'Must be ≥ 0')
    .max(1000, 'Must be ≤ 1000'),
  maxAmountXlm: z
    .number({ invalid_type_error: 'Enter a number' })
    .min(0, 'Must be ≥ 0')
    .max(1_000_000_000, 'Too large'),
  minAmountXlm: z
    .number({ invalid_type_error: 'Enter a number' })
    .min(0, 'Must be ≥ 0')
    .max(1_000_000_000, 'Too large'),
  maxDueDays: z
    .number({ invalid_type_error: 'Enter a number' })
    .min(0, 'Must be ≥ 0')
    .max(3650, 'Must be ≤ 3650'),
}).refine(
  d => d.minAmountXlm <= d.maxAmountXlm || d.maxAmountXlm === 0,
  { message: 'Min amount must be ≤ max amount', path: ['minAmountXlm'] },
);

type FormValues = z.infer<typeof schema>;

// ── Conversion helpers ────────────────────────────────────────────────────────

function prefsToForm(p: LenderPreferences): FormValues {
  return {
    riskProfile: p.riskProfile,
    currencyPreference: p.currencyPreference,
    minYieldPercent: p.minYieldBps / 100,
    maxAmountXlm: Number(p.maxAmountStroops) / STROOPS_PER_XLM,
    minAmountXlm: Number(p.minAmountStroops) / STROOPS_PER_XLM,
    maxDueDays: p.maxDueDays,
  };
}

function formToPrefs(v: FormValues): LenderPreferences {
  return {
    riskProfile: v.riskProfile as RiskProfile,
    currencyPreference: v.currencyPreference as CurrencyPreference,
    minYieldBps: Math.round(v.minYieldPercent * 100),
    maxAmountStroops: BigInt(Math.round(v.maxAmountXlm * STROOPS_PER_XLM)),
    minAmountStroops: BigInt(Math.round(v.minAmountXlm * STROOPS_PER_XLM)),
    maxDueDays: v.maxDueDays,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface OptionButtonProps {
  value: string;
  current: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  description?: string;
}

function OptionButton({ value, current, onChange, children, description }: OptionButtonProps) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={active}
      className={cn(
        'flex-1 rounded-lg border px-3 py-2.5 text-sm text-start transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary/10 text-primary font-medium'
          : 'border-input bg-background text-foreground hover:border-muted-foreground/50',
      )}
    >
      <span className="block font-medium">{children}</span>
      {description && (
        <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>
      )}
    </button>
  );
}

interface FieldErrorProps { message?: string }
function FieldError({ message }: FieldErrorProps) {
  if (!message) return null;
  return <p className="text-xs text-destructive mt-1">{message}</p>;
}

// ── Main component ────────────────────────────────────────────────────────────

interface LenderPreferencesFormProps {
  preferences: LenderPreferences;
  onSave: (p: LenderPreferences) => Promise<void>;
  onReset: () => Promise<void>;
  saving?: boolean;
  /** Custom trigger element. Defaults to a Settings icon button. */
  trigger?: React.ReactNode;
}

export function LenderPreferencesForm({
  preferences,
  onSave,
  onReset,
  saving = false,
  trigger,
}: LenderPreferencesFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: prefsToForm(preferences),
  });

  // Sync form when external preferences change (e.g., loaded from Supabase)
  useEffect(() => {
    reset(prefsToForm(preferences));
  }, [preferences, reset]);

  const riskProfile        = watch('riskProfile');
  const currencyPreference = watch('currencyPreference');

  const onSubmit = useCallback(
    async (values: FormValues) => {
      await onSave(formToPrefs(values));
      reset(values); // mark form as pristine after successful save
    },
    [onSave, reset],
  );

  const handleReset = useCallback(async () => {
    await onReset();
    // form will resync via the useEffect above
  }, [onReset]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" aria-label="Matching preferences">
            <Settings2 className="h-4 w-4 me-2" />
            Preferences
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Matching Preferences</DialogTitle>
          <DialogDescription>
            Configure your risk appetite, currency preference, and yield requirements so
            the matching engine can surface the most relevant invoices for you.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-2">

          {/* Risk profile */}
          <div className="space-y-2">
            <Label>Risk profile</Label>
            <div className="flex gap-2">
              {(['conservative', 'moderate', 'aggressive'] as const).map(r => (
                <OptionButton
                  key={r}
                  value={r}
                  current={riskProfile}
                  onChange={v => setValue('riskProfile', v as RiskProfile, { shouldDirty: true })}
                  description={
                    r === 'conservative' ? 'Safety first, lower yield'
                    : r === 'moderate' ? 'Balanced risk & yield'
                    : 'High yield, higher risk'
                  }
                >
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </OptionButton>
              ))}
            </div>
          </div>

          {/* Currency preference */}
          <div className="space-y-2">
            <Label>Currency preference</Label>
            <div className="flex gap-2">
              {(['XLM', 'USDC', 'both'] as const).map(c => (
                <OptionButton
                  key={c}
                  value={c}
                  current={currencyPreference}
                  onChange={v => setValue('currencyPreference', v as CurrencyPreference, { shouldDirty: true })}
                >
                  {c === 'both' ? 'Both (any)' : c}
                </OptionButton>
              ))}
            </div>
          </div>

          {/* Minimum yield */}
          <div className="space-y-2">
            <Label htmlFor="minYieldPercent">
              Minimum yield (% APY)
              <span className="ms-1 text-xs text-muted-foreground font-normal">
                — invoices below this yield are ranked lower
              </span>
            </Label>
            <div className="relative">
              <Input
                id="minYieldPercent"
                type="number"
                step="0.01"
                min="0"
                max="1000"
                className="pe-8"
                {...register('minYieldPercent', { valueAsNumber: true })}
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            <FieldError message={errors.minYieldPercent?.message} />
          </div>

          {/* Amount bounds */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="minAmountXlm">
                Min amount (XLM)
                <span className="ms-1 text-xs text-muted-foreground font-normal">0 = no floor</span>
              </Label>
              <Input
                id="minAmountXlm"
                type="number"
                step="1"
                min="0"
                {...register('minAmountXlm', { valueAsNumber: true })}
              />
              <FieldError message={errors.minAmountXlm?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxAmountXlm">
                Max amount (XLM)
                <span className="ms-1 text-xs text-muted-foreground font-normal">0 = no cap</span>
              </Label>
              <Input
                id="maxAmountXlm"
                type="number"
                step="1"
                min="0"
                {...register('maxAmountXlm', { valueAsNumber: true })}
              />
              <FieldError message={errors.maxAmountXlm?.message} />
            </div>
          </div>

          {/* Max due days */}
          <div className="space-y-2">
            <Label htmlFor="maxDueDays">
              Max due-date horizon (days)
              <span className="ms-1 text-xs text-muted-foreground font-normal">0 = no cap</span>
            </Label>
            <Input
              id="maxDueDays"
              type="number"
              step="1"
              min="0"
              max="3650"
              {...register('maxDueDays', { valueAsNumber: true })}
            />
            <FieldError message={errors.maxDueDays?.message} />
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              <RotateCcw className="h-3.5 w-3.5 me-1.5" />
              Reset to defaults
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !isDirty}
              className="w-full sm:w-auto"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />}
              Save preferences
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
