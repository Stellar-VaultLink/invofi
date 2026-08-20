import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Approval Queue',
  description:
    'Multi-signature approval queue for high-value operations. High-value transactions collect M-of-N wallet approvals before they can be submitted to the Stellar network.',
  openGraph: {
    title: 'InvoFi Approval Queue — Multi-Signature Transaction Approval',
    description:
      'High-value operations require multiple wallet approvals before they settle. Review, approve, execute, or reject pending transactions.',
  },
};

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
