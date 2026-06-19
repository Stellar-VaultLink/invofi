import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/layout/Providers';
import { Navbar } from '@/components/layout/Navbar';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'InvoFi — Decentralized Invoice Financing on Stellar',
  description:
    'Tokenize invoices as on-chain assets and get immediate financing from investors — powered by Stellar Soroban.',
  keywords: ['invoice financing', 'DeFi', 'Stellar', 'Soroban', 'blockchain'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <Navbar />
          <main>{children}</main>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
