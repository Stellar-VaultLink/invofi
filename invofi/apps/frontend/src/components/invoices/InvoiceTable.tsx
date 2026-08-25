'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Calendar, DollarSign } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/common/StatusBadge';
import { formatAmount, formatDate, formatWalletAddress } from '@/lib/formatters';
import type { Invoice } from '@/types';

type SortField = 'amount' | 'due_date' | 'status' | 'created_at';
type SortDir = 'asc' | 'desc';

interface InvoiceTableProps {
  invoices: Invoice[];
  onRowClick?: (invoice: Invoice) => void;
  loading?: boolean;
}

export function InvoiceTable({ invoices, onRowClick, loading }: InvoiceTableProps) {
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  const sorted = [...invoices].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'amount') cmp = Number(a.amount) - Number(b.amount);
    else if (sortField === 'due_date') cmp = Number(a.due_date) - Number(b.due_date);
    else if (sortField === 'status') cmp = a.status.localeCompare(b.status);
    else cmp = Number((a as unknown as Record<string, unknown>).created_at ?? 0) - Number((b as unknown as Record<string, unknown>).created_at ?? 0);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronsUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDir === 'asc'
      ? <ChevronUp className="ml-1 h-3 w-3" />
      : <ChevronDown className="ml-1 h-3 w-3" />;
  }

  function SortableHead({ field, label }: { field: SortField; label: string }) {
    return (
      <TableHead
        className="cursor-pointer select-none whitespace-nowrap"
        onClick={() => toggleSort(field)}
        aria-sort={sortField === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <span className="inline-flex items-center">
          {label}
          <SortIcon field={field} />
        </span>
      </TableHead>
    );
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        {/* Mobile skeleton */}
        <div className="md:hidden space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-lg border border-border p-4 space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <div className="flex justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
        {/* Desktop skeleton */}
        <div className="overflow-x-auto rounded-lg border hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice ID</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    );
  }

  if (invoices.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No invoices found.
      </p>
    );
  }

  return (
    <>
      {/* ── Mobile card layout ─────────────────────────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {sorted.map(inv => (
          <div
            key={inv.id}
            className={`rounded-lg border border-border p-4 transition-colors ${
              onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''
            }`}
            onClick={() => onRowClick?.(inv)}
            role={onRowClick ? 'button' : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(inv); } } : undefined}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground truncate max-w-[140px]">
                {inv.id.toString().slice(0, 12)}&hellip;
              </span>
              <StatusBadge status={inv.status} />
            </div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-1.5">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {formatAmount(Number(inv.amount), inv.currency ?? 'XLM')}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono">{formatWalletAddress(inv.originator)}</span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(Number(inv.due_date))}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Desktop table layout ─────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice ID</TableHead>
              <TableHead>Business</TableHead>
              <SortableHead field="amount" label="Amount" />
              <SortableHead field="due_date" label="Due Date" />
              <SortableHead field="status" label="Status" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(inv => (
              <TableRow
                key={inv.id}
                className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                onClick={() => onRowClick?.(inv)}
              >
                <TableCell className="font-mono text-xs">{inv.id.toString().slice(0, 12)}&hellip;</TableCell>
                <TableCell className="font-mono text-xs">{formatWalletAddress(inv.originator)}</TableCell>
                <TableCell>{formatAmount(Number(inv.amount), inv.currency ?? 'XLM')}</TableCell>
                <TableCell>{formatDate(Number(inv.due_date))}</TableCell>
                <TableCell><StatusBadge status={inv.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}