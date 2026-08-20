import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portfolio Analytics',
  description: 'Detailed portfolio performance metrics, yield history, and risk analysis.',
};

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
