import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Set up your profile',
  description: 'Choose your InvoFi username and account role.',
};

export default function ProfileSetupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
