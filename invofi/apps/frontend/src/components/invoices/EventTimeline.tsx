'use client';

import {
  AlertOctagon,
  Award,
  Banknote,
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Flag,
  MinusCircle,
  PencilLine,
  PlusCircle,
  RefreshCw,
  Scale,
  Shield,
  ShieldOff,
  Star,
  LifeBuoy,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvoiceEvents } from '@/hooks/useInvoiceEvents';
import { invoiceEventsEnabled, type InvoiceTimelineEntry } from '@/lib/invoiceEvents';
import { explorerTxUrl } from '@/lib/constants';
import { formatAddress } from '@/lib/utils';

const EVENT_ICONS: Record<string, LucideIcon> = {
  inv_reg: FileText,
  inv_amt: PencilLine,
  inv_sts: RefreshCw,
  inv_cxl: XCircle,
  inv_ovd: Clock,
  inv_def: AlertOctagon,
  inv_dsp: Flag,
  inv_rsl: Scale,
  off_new: PlusCircle,
  off_wdr: MinusCircle,
  off_acc: CheckCircle2,
  off_rej: Ban,
  off_def: AlertOctagon,
  pos_mint: Award,
  inv_rep: Banknote,
  pool_stk: Shield,
  pool_un: ShieldOff,
  pool_pay: LifeBuoy,
  reputn: Star,
};

/**
 * Per-event dot + icon colors. Both class names are written out in full
 * (never constructed dynamically) so Tailwind's JIT scanner picks them up.
 */
const EVENT_STYLES: Record<string, { dot: string; icon: string }> = {
  inv_reg: { dot: 'bg-blue-500', icon: 'text-blue-600' },
  inv_amt: { dot: 'bg-blue-500', icon: 'text-blue-600' },
  inv_sts: { dot: 'bg-blue-500', icon: 'text-blue-600' },
  inv_cxl: { dot: 'bg-gray-400', icon: 'text-gray-500' },
  inv_ovd: { dot: 'bg-amber-500', icon: 'text-amber-600' },
  inv_def: { dot: 'bg-red-600', icon: 'text-red-600' },
  inv_dsp: { dot: 'bg-amber-600', icon: 'text-amber-600' },
  inv_rsl: { dot: 'bg-teal-600', icon: 'text-teal-600' },
  off_new: { dot: 'bg-purple-600', icon: 'text-purple-600' },
  off_wdr: { dot: 'bg-purple-400', icon: 'text-purple-500' },
  off_acc: { dot: 'bg-green-600', icon: 'text-green-600' },
  off_rej: { dot: 'bg-gray-400', icon: 'text-gray-500' },
  off_def: { dot: 'bg-red-600', icon: 'text-red-600' },
  pos_mint: { dot: 'bg-green-600', icon: 'text-green-600' },
  inv_rep: { dot: 'bg-emerald-600', icon: 'text-emerald-600' },
  pool_stk: { dot: 'bg-sky-600', icon: 'text-sky-600' },
  pool_un: { dot: 'bg-sky-400', icon: 'text-sky-500' },
  pool_pay: { dot: 'bg-emerald-600', icon: 'text-emerald-600' },
  reputn: { dot: 'bg-indigo-500', icon: 'text-indigo-600' },
};

const FALLBACK_STYLE = { dot: 'bg-gray-400', icon: 'text-gray-500' };

function EventRow({ entry }: { entry: InvoiceTimelineEntry }) {
  const Icon = EVENT_ICONS[entry.type] ?? FileText;
  const accent = EVENT_STYLES[entry.type] ?? FALLBACK_STYLE;

  return (
    <li className="relative ps-8 pb-5 last:pb-0">
      <span
        className={`absolute start-[-5px] top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full ${accent.dot}`}
        aria-hidden="true"
      />
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${accent.icon}`} aria-hidden="true" />
        <p className="text-sm font-medium text-gray-900">{entry.label}</p>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-gray-500">
          {entry.type}
        </span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
        <span>{entry.occurredAt ? format(new Date(entry.occurredAt), 'MMM d, yyyy h:mm a') : '—'}</span>
        <span aria-hidden="true">·</span>
        <span>Ledger #{entry.ledger}</span>
        {entry.txHash && (
          <>
            <span aria-hidden="true">·</span>
            <a
              href={explorerTxUrl(entry.txHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-blue-600 hover:underline"
              title={entry.txHash}
            >
              {formatAddress(entry.txHash)} <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}
      </p>
    </li>
  );
}

export function EventTimeline({ invoiceId }: { invoiceId: string }) {
  const enabled = invoiceEventsEnabled();
  const { entries, loading, error } = useInvoiceEvents(enabled ? invoiceId : undefined);

  if (!enabled) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">On-chain Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-4" data-testid="event-timeline-loading">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-1 h-2.5 w-2.5 animate-pulse rounded-full bg-gray-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-40 animate-pulse rounded bg-gray-200" />
                  <div className="h-3 w-64 max-w-full animate-pulse rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-gray-500">Couldn&apos;t load on-chain activity right now.</p>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="text-sm text-gray-500">
            <p>No recent on-chain activity found for this invoice.</p>
            <p className="mt-1 text-xs text-gray-400">
              The Soroban RPC keeps only a few days of event history, so older invoices may show nothing here.
            </p>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <ol className="relative ms-[5px] border-s border-gray-200">
            {entries.map((entry, i) => (
              <EventRow key={`${entry.txHash}:${entry.type}:${entry.ledger}:${i}`} entry={entry} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
