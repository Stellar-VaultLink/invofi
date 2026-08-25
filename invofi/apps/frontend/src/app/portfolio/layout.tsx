import type { Metadata } from 'next';
import { LivePortfolioProvider } from '@/components/portfolio/LivePortfolioProvider';

export const metadata: Metadata = {
  title: 'Portfolio',
  description: 'Track your active investments, earned yield, and repayment history across all financed invoices.',
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return (
    <LivePortfolioProvider>
      {children}
    </LivePortfolioProvider>
  );
}
