import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EmptyStateVariant =
  | 'no-invoices'
  | 'no-offers'
  | 'no-positions'
  | 'no-results';

const VARIANT_LABELS: Record<EmptyStateVariant, string> = {
  'no-invoices': 'No invoices yet',
  'no-offers': 'No financing offers yet',
  'no-positions': 'No positions yet',
  'no-results': 'No results found',
};

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
  /** When set, renders an inline brand illustration instead of the `icon`. */
  variant?: EmptyStateVariant;
}

/**
 * Brand illustration built from the hexagon-invoice mark. Rendered as a fully
 * inline SVG (no network requests) and inherits the surrounding text color so
 * it adapts to both light and dark themes.
 */
function EmptyStateIllustration({ variant }: { variant: EmptyStateVariant }) {
  const accent = 'currentColor';
  return (
    <svg
      viewBox="0 0 64 64"
      className="mx-auto mb-4 h-20 w-20"
      role="img"
      aria-label={VARIANT_LABELS[variant]}
    >
      {/* Hexagon brand mark */}
      <polygon
        points="32,4 56,18 56,46 32,60 8,46 8,18"
        fill="none"
        stroke={accent}
        strokeWidth="2.5"
        strokeLinejoin="round"
        opacity="0.85"
      />
      {/* Corner-cut invoice document */}
      <path
        d="M 22,18 L 36,18 L 42,24 L 42,46 A 2,2 0 0 1 40,48 L 24,48 A 2,2 0 0 1 22,46 Z"
        fill="none"
        stroke={accent}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M 36,18 L 36,24 L 42,24 Z" fill="none" stroke={accent} strokeWidth="1.8" strokeLinejoin="round" />

      {/* Variant-specific soft detail (low opacity = muted accent) */}
      <g stroke={accent} opacity="0.5" strokeLinecap="round">
        {variant === 'no-invoices' && (
          <g strokeWidth="1.8">
            <line x1="27" y1="33" x2="39" y2="33" />
            <line x1="27" y1="38" x2="39" y2="38" />
            <line x1="27" y1="43" x2="35" y2="43" />
            {/* Plus badge signals "create" affordance */}
            <circle cx="24" cy="28" r="4.2" fill={accent} opacity="0.18" stroke="none" />
            <path d="M 24,26.5 L 24,29.5 M 22.5,28 L 25.5,28" stroke="white" strokeWidth="1.2" opacity="0.9" />
          </g>
        )}

        {variant === 'no-offers' && (
          <g strokeWidth="1.8">
            <line x1="27" y1="33" x2="39" y2="33" />
            <line x1="27" y1="38" x2="39" y2="38" />
            <line x1="27" y1="43" x2="39" y2="43" />
            <circle cx="42" cy="42" r="6" fill="none" strokeWidth="1.8" />
            <path d="M 42,39 L 42,45 M 40.2,40.5 L 43.8,40.5" strokeWidth="1.4" />
          </g>
        )}

        {variant === 'no-positions' && (
          <g strokeWidth="1.8">
            <line x1="27" y1="38" x2="39" y2="38" />
            <line x1="27" y1="43" x2="39" y2="43" />
            <path d="M 27,33 L 39,33" opacity="0.5" strokeDasharray="1.6 2.4" />
          </g>
        )}

        {variant === 'no-results' && (
          <g strokeWidth="1.8">
            <line x1="27" y1="33" x2="39" y2="33" />
            <line x1="27" y1="38" x2="39" y2="38" />
            {/* Magnifier */}
            <circle cx="43" cy="31" r="4.6" fill="none" strokeWidth="1.8" />
            <line x1="46.5" y1="34.5" x2="50" y2="38" />
            <path d="M 27,45 L 34,45" />
          </g>
        )}
      </g>
    </svg>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className, variant }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-16 px-4', className)}>
      {variant ? (
        <EmptyStateIllustration variant={variant} />
      ) : (
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          {Icon && <Icon className="h-7 w-7 text-gray-400" />}
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs leading-relaxed">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
