'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pageCountOf, rangeLabel } from '@/lib/pagination';

export interface PaginationControlsProps {
  /** Current 1-based page. */
  page: number;
  /** Total number of items across all pages. */
  total: number;
  /** Items per page. */
  pageSize: number;
  /** Called when the user navigates to a new page. */
  onPageChange: (page: number) => void;
  /** Called when the user picks a different page size. */
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function PaginationControls({
  page,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  const count = pageCountOf(total, pageSize);
  const prevDisabled = page <= 1 || count <= 1;
  const nextDisabled = page >= count || count <= 1;

  if (total === 0) {
    return (
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
        <span className="text-xs text-muted-foreground">0 positions</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
      {/* Left: item count + page-size selector */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {rangeLabel(page, pageSize, total)}
        </span>
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="text-xs px-2 py-1 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          aria-label="Page size"
        >
          {PAGE_SIZE_OPTIONS.map(s => (
            <option key={s} value={s}>
              {s} / page
            </option>
          ))}
        </select>
      </div>

      {/* Right: pagination buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={prevDisabled}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {count <= 7 ? (
          /* Few pages — show all */
          Array.from({ length: count }, (_, i) => i + 1).map(p => (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="sm"
              className="min-w-[32px]"
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          ))
        ) : (
          /* Many pages — compact navigation */
          <>
            {/* Always show first page */}
            <Button
              variant={1 === page ? 'default' : 'outline'}
              size="sm"
              className="min-w-[32px]"
              onClick={() => onPageChange(1)}
            >
              1
            </Button>
            {/* Page before current */}
            {page > 3 && <span className="text-xs text-muted-foreground px-1">…</span>}
            {page > 2 && (
              <Button
                variant="outline"
                size="sm"
                className="min-w-[32px]"
                onClick={() => onPageChange(page - 1)}
              >
                {page - 1}
              </Button>
            )}
            {/* Current page (not shown if it's 1 or count) */}
            {page !== 1 && page !== count && (
              <Button variant="default" size="sm" className="min-w-[32px]">
                {page}
              </Button>
            )}
            {/* Page after current */}
            {page < count - 1 && (
              <Button
                variant="outline"
                size="sm"
                className="min-w-[32px]"
                onClick={() => onPageChange(page + 1)}
              >
                {page + 1}
              </Button>
            )}
            {page < count - 2 && <span className="text-xs text-muted-foreground px-1">…</span>}
            {/* Always show last page */}
            <Button
              variant={count === page ? 'default' : 'outline'}
              size="sm"
              className="min-w-[32px]"
              onClick={() => onPageChange(count)}
            >
              {count}
            </Button>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={nextDisabled}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}