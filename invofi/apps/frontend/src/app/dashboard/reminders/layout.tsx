import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reminder Settings — InvoFi',
  description:
    'Admin controls for the automated invoice reminder system: schedule, webhook delivery, and send history.',
  // Prevent search engines from indexing the admin dashboard.
  robots: { index: false, follow: false },
};

export default function RemindersDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
