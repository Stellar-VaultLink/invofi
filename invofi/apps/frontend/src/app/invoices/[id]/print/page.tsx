import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

/**
 * The print page uses window.print(), useParams, and fetches data on the
 * client — there is nothing to server-render and SSR only causes a hydration
 * mismatch. Opt out completely with { ssr: false }.
 */
const InvoicePrintView = dynamic<Record<string, never>>(
  () => import('./InvoicePrintView') as Promise<{ default: ComponentType<Record<string, never>> }>,
  { ssr: false, loading: () => null }
);

export default function InvoicePrintPage() {
  return <InvoicePrintView />;
}
