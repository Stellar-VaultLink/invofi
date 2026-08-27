import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Protocol Health — InvoFi',
  description:
    'Real-time protocol health monitoring dashboard for InvoFi maintainers. Admin access only.',
  // Prevent search engines from indexing the admin dashboard.
  robots: { index: false, follow: false },
};

export default function HealthDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
