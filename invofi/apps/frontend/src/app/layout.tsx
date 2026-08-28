import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { dirFor } from '@/i18n/config';
import './globals.css';
import { Providers } from '@/components/layout/Providers';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://invofi-five.vercel.app'),
  title: {
    template: '%s — InvoFi',
    default: 'InvoFi — Decentralized Invoice Financing on Stellar',
  },
  description:
    'Tokenize invoices as on-chain assets and get immediate financing from investors — powered by Stellar Soroban.',
  keywords: ['invoice financing', 'DeFi', 'Stellar', 'Soroban', 'blockchain'],
  openGraph: {
    title: 'InvoFi — Decentralized Invoice Financing on Stellar',
    description:
      'Tokenize invoices as on-chain assets and get immediate financing from investors — powered by Stellar Soroban.',
    url: 'https://invofi-five.vercel.app',
    siteName: 'InvoFi',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'InvoFi — Decentralized Invoice Financing on Stellar',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'InvoFi — Decentralized Invoice Financing on Stellar',
    description:
      'Tokenize invoices as on-chain assets and get immediate financing from investors — powered by Stellar Soroban.',
    images: ['/og-image.png'],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    // `dir` is what actually mirrors the layout for Arabic, Hebrew and Persian.
    // It only produces a correct mirror because the app's spacing, alignment
    // and borders use CSS logical properties (`ms-*`/`me-*`, `ps-*`/`pe-*`,
    // `start-*`/`end-*`, `text-start`) rather than physical left/right ones —
    // see docs/i18n.md before adding a directional utility.
    <html lang={locale} dir={dirFor(locale)}>
      <body
        className={`${inter.className} bg-white dark:bg-gray-950 dark:text-white`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            <Navbar />
            <main>{children}</main>
            <Footer />
            <Toaster />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}