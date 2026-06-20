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
  openGraph: {
    title: 'InvoFi — Decentralized Invoice Financing on Stellar',
    description:
      'Tokenize invoices as on-chain assets and get immediate financing from investors — powered by Stellar Soroban.',
    url: 'https://invofi-five.vercel.app',
    siteName: 'InvoFi',
    images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: 'InvoFi' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'InvoFi — Decentralized Invoice Financing on Stellar',
    description:
      'Tokenize invoices as on-chain assets and get immediate financing from investors — powered by Stellar Soroban.',
    images: ['/og-image.svg'],
  },
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
