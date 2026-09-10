'use client';

/**
 * FractionalizationWizard
 *
 * Three-step flow for invoice owners to split their invoice into N position
 * fraction tokens:
 *
 *   Step 1 — Configure: set N, token metadata, description
 *   Step 2 — Review:    economics summary (price derived, not user-editable),
 *                       confirm before writing
 *   Step 3 — Done:      success state with share link and next actions
 *
 * The `pricePerFraction` is **derived** as
 * `floor(invoice.amount / totalFractions)` using bigint truncating division so
 * `pricePerFraction × totalFractions ≤ invoice.amount` — the fractionalization
 * never over-promises value.
 *
 * `createFractionalization()` atomically inserts the record and seeds the first
 * price-history point.  If the price-history write fails it rolls back the
 * record so the caller can retry cleanly.
 */

import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Scissors,
  Tag,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import {
  createFractionalization,
  computeTotalCost,
  derivePerFractionPrice,
} from '@/lib/securitization';
import { formatAmount } from '@/lib/utils';
import type { FractionalizationRecord } from '@/types/securitization';
import type { Invoice } from '@/types';

// ── Wizard-local form schema ──────────────────────────────────────────────────
// pricePerFraction is derived, not user-editable.

const wizardSchema = z.object({
  totalFractions: z
    .number({ invalid_type_error: 'Enter a whole number' })
    .int('Must be a whole number')
    .min(2, 'Minimum 2 fractions')
    .max(1_000_000, 'Maximum 1 000 000 fractions'),
  tokenSymbol: z
    .string()
    .min(3, 'At least 3 characters')
    .max(12, 'Max 12 characters')
    .regex(/^[A-Z0-9-]+$/, 'Uppercase letters, digits, and hyphens only'),
  tokenName: z.string().min(3, 'At least 3 characters').max(64, 'Max 64 characters'),
  description: z.string().max(500, 'Max 500 characters'),
});

type WizardDraft = z.infer<typeof wizardSchema>;

// ── Sub-components ────────────────────────────────────────────────────────────

/** Animated step indicator for the 3-step wizard. */
interface StepIndicatorProps {
  current: number;
  total: number;
}

function StepIndicator({ current, total }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2 mb-6" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={[
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border-2 transition-colors',
                done
                  ? 'bg-primary border-primary text-primary-foreground'
                  : active
                  ? 'border-primary text-primary'
                  : 'border-muted text-muted-foreground',
              ].join(' ')}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : step}
            </div>
            {i < total - 1 && (
              <div className={`h-0.5 w-8 ${done ? 'bg-primary' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive mt-1">{message}</p>;
}

// ── Step 1: Configure ─────────────────────────────────────────────────────────

interface Step1Props {
  invoice: Invoice;
  onNext: (data: WizardDraft) => void;
  defaultValues?: Partial<WizardDraft>;
}

function Step1Configure({ invoice, onNext, defaultValues }: Step1Props) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<WizardDraft>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      totalFractions: defaultValues?.totalFractions ?? 100,
      tokenSymbol: defaultValues?.tokenSymbol ?? `INV-${invoice.id.toUpperCase().slice(-4)}-FRAC`,
      tokenName: defaultValues?.tokenName ?? `Invoice ${invoice.id} Fraction`,
      description: defaultValues?.description ?? '',
    },
  });

  const totalFractions = watch('totalFractions') || 0;

  // Derive price from invoice amount — display only, not editable
  let derivedPrice = '';
  let derivedTotalValue = '';
  try {
    if (Number.isInteger(totalFractions) && totalFractions >= 2) {
      derivedPrice = derivePerFractionPrice(invoice.amount as unknown as string, totalFractions);
      derivedTotalValue = computeTotalCost(derivedPrice, totalFractions);
    }
  } catch { /* not yet valid */ }

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
        Fractionalizing invoice{' '}
        <span className="font-mono font-medium text-foreground">{invoice.id}</span>
        {' '}· {formatAmount(invoice.amount)} {invoice.currency}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="totalFractions">
          Number of fractions
          <span className="ml-1 text-xs text-muted-foreground font-normal">(2 – 1 000 000)</span>
        </Label>
        <Input
          id="totalFractions"
          type="number"
          min="2"
          max="1000000"
          step="1"
          {...register('totalFractions', { valueAsNumber: true })}
        />
        <FieldError message={errors.totalFractions?.message} />
      </div>

      {/* Derived economics — read-only display */}
      {derivedPrice && (
        <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 p-3 text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Price / fraction: </span>
            <span className="font-semibold font-mono text-foreground">
              {derivedPrice} {invoice.currency}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">Total sale value: </span>
            <span className="font-semibold font-mono text-foreground">
              {derivedTotalValue} {invoice.currency}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Price is derived from the invoice amount to prevent over-promising.
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tokenSymbol">Token symbol</Label>
          <Input
            id="tokenSymbol"
            placeholder="INV-001-FRAC"
            className="uppercase"
            {...register('tokenSymbol')}
          />
          <FieldError message={errors.tokenSymbol?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tokenName">Token name</Label>
          <Input
            id="tokenName"
            placeholder="Invoice 001 Fraction"
            {...register('tokenName')}
          />
          <FieldError message={errors.tokenName?.message} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">
          Description
          <span className="ml-1 text-xs text-muted-foreground font-normal">(optional, shown to buyers)</span>
        </Label>
        <textarea
          id="description"
          rows={3}
          maxLength={500}
          placeholder="Describe the invoice, the counterparty, or any terms buyers should know."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          {...register('description')}
        />
        <FieldError message={errors.description?.message} />
      </div>

      <div className="flex justify-end">
        <Button type="submit">
          Review <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </form>
  );
}

// ── Step 2: Review ────────────────────────────────────────────────────────────

interface Step2Props {
  invoice: Invoice;
  draft: WizardDraft;
  derivedPrice: string;
  onBack: () => void;
  onConfirm: () => Promise<void>;
  submitting: boolean;
}

function Step2Review({ invoice, draft, derivedPrice, onBack, onConfirm, submitting }: Step2Props) {
  const totalSaleValue = computeTotalCost(derivedPrice, draft.totalFractions);

  const rows = [
    { label: 'Invoice', value: invoice.id },
    { label: 'Invoice value', value: `${formatAmount(invoice.amount)} ${invoice.currency}` },
    { label: 'Total fractions', value: draft.totalFractions.toLocaleString() },
    { label: 'Price per fraction', value: `${derivedPrice} ${invoice.currency}` },
    { label: 'Total sale value', value: `${totalSaleValue} ${invoice.currency}` },
    { label: 'Token symbol', value: draft.tokenSymbol },
    { label: 'Token name', value: draft.tokenName },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="pt-5 divide-y divide-border">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex justify-between py-2.5 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-foreground font-mono">{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {draft.description && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Description: </span>
          {draft.description}
        </div>
      )}

      <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
        Once confirmed, investors can immediately purchase fractions. You can cancel the
        fractionalization later, but purchased fractions cannot be recalled.
      </p>

      <div className="flex justify-between gap-3">
        <Button variant="outline" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
        </Button>
        <Button onClick={onConfirm} disabled={submitting}>
          {submitting ? (
            <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Publishing…</>
          ) : (
            <>Confirm &amp; publish</>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Step 3: Done ──────────────────────────────────────────────────────────────

interface Step3Props {
  record: FractionalizationRecord;
  onViewMarketplace: () => void;
}

function Step3Done({ record, onViewMarketplace }: Step3Props) {
  return (
    <div className="text-center space-y-4 py-4">
      <div className="mx-auto h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
        <Check className="h-7 w-7 text-green-600" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">Fractionalization published!</h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
        <strong>{record.total_fractions.toLocaleString()}</strong> fraction tokens at{' '}
        <strong>{record.price_per_fraction} {record.price_currency}</strong> each are now
        available for investors to purchase in the marketplace.
      </p>
      <div className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-mono bg-muted">
        <Tag className="h-3 w-3" />
        {record.token_symbol}
      </div>
      <div className="flex justify-center gap-3 pt-2">
        <Button onClick={onViewMarketplace}>View in marketplace</Button>
      </div>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

interface FractionalizationWizardProps {
  invoice: Invoice;
  originatorId: string;
  originatorAddress: string;
  /** Called after successful publication with the created record. */
  onComplete?: (record: FractionalizationRecord) => void;
  /** Called when "View in marketplace" is clicked. */
  onViewMarketplace?: () => void;
}

/**
 * Three-step wizard to fractionalize an invoice.
 *
 * The price per fraction is derived from `invoice.amount / totalFractions`
 * (truncating bigint division) rather than accepted as free-form user input,
 * so the fractionalization never over-promises value.
 */
export function FractionalizationWizard({
  invoice,
  originatorId,
  originatorAddress,
  onComplete,
  onViewMarketplace,
}: FractionalizationWizardProps) {
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<WizardDraft | null>(null);
  const [derivedPrice, setDerivedPrice] = useState('');
  const [record, setRecord] = useState<FractionalizationRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleStep1 = useCallback(
    (data: WizardDraft) => {
      const price = derivePerFractionPrice(
        invoice.amount as unknown as string,
        data.totalFractions,
      );
      setDerivedPrice(price);
      setDraft(data);
      setStep(2);
    },
    [invoice.amount],
  );

  const handleConfirm = useCallback(async () => {
    if (!draft || !derivedPrice) return;
    setSubmitting(true);
    try {
      const created = await createFractionalization(
        {
          ...draft,
          pricePerFraction: derivedPrice,
          priceCurrency: invoice.currency as 'XLM' | 'USDC',
        },
        invoice.id,
        originatorId,
        originatorAddress,
      );
      setRecord(created);
      setStep(3);
      onComplete?.(created);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      const msg =
        raw.includes('unique') || raw.includes('duplicate')
          ? 'This invoice already has an active fractionalization.'
          : raw || 'Could not publish the fractionalization';
      toast({ title: 'Fractionalization failed', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }, [draft, derivedPrice, invoice, originatorId, originatorAddress, onComplete, toast]);

  const STEP_LABELS = ['Configure', 'Review', 'Done'];

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Scissors className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Fractionalize Invoice</h2>
      </div>

      <StepIndicator current={step} total={3} />

      <p className="text-xs text-muted-foreground mb-5 font-medium tracking-wide uppercase">
        {STEP_LABELS[step - 1]}
      </p>

      {step === 1 && (
        <Step1Configure
          invoice={invoice}
          onNext={handleStep1}
          defaultValues={draft ?? undefined}
        />
      )}
      {step === 2 && draft && (
        <Step2Review
          invoice={invoice}
          draft={draft}
          derivedPrice={derivedPrice}
          onBack={() => setStep(1)}
          onConfirm={handleConfirm}
          submitting={submitting}
        />
      )}
      {step === 3 && record && (
        <Step3Done record={record} onViewMarketplace={() => onViewMarketplace?.()} />
      )}
    </div>
  );
}
