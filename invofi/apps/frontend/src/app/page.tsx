import Link from 'next/link';
import { ArrowRight, FileText, TrendingUp, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STATS = [
  { label: 'Total Invoices Financed', value: '124' },
  { label: 'Total Volume', value: '$2.4M' },
  { label: 'Active Lenders', value: '340' },
  { label: 'Avg. Interest Rate', value: '8.5%' },
];

const FEATURES = [
  {
    icon: FileText,
    title: 'Tokenize Invoices',
    description:
      'Register your business invoices as on-chain assets on Stellar Soroban in seconds.',
  },
  {
    icon: TrendingUp,
    title: 'Get Financed Fast',
    description:
      'Receive competitive financing offers from a global pool of investors within hours, not weeks.',
  },
  {
    icon: Shield,
    title: 'Trustless & Transparent',
    description:
      'All terms, transfers, and repayments are governed by smart contracts — no middlemen.',
  },
  {
    icon: Zap,
    title: 'Instant Settlement',
    description:
      "Stellar's 5-second finality means funds move at the speed of code, not banking.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm mb-8">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Live on Stellar Testnet
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
            Invoice Financing,
            <br />
            <span className="text-blue-200">On-Chain.</span>
          </h1>

          <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-10 leading-relaxed">
            Businesses tokenize unpaid invoices as Soroban assets and get immediate
            liquidity. Investors earn yield by financing real-world receivables — trustlessly.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="bg-white text-blue-700 hover:bg-blue-50 font-semibold">
              <Link href="/auth/register">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white text-white bg-white/10 hover:bg-white/20">
              <Link href="/marketplace">Browse Marketplace</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white border-b py-12 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {STATS.map(stat => (
            <div key={stat.label}>
              <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">How InvoFi Works</h2>
          <p className="text-center text-gray-500 mb-14 max-w-xl mx-auto">
            A two-sided marketplace connecting businesses needing liquidity with investors
            seeking yield — all settled on the Stellar blockchain.
          </p>
          <div className="grid md:grid-cols-2 gap-8">
            {FEATURES.map(feature => (
              <div
                key={feature.title}
                className="bg-white rounded-xl border border-gray-200 p-6 flex gap-4"
              >
                <div className="shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <feature.icon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{feature.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-white text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to get started?</h2>
        <p className="text-gray-500 mb-8">
          Connect your Stellar wallet or create an account to begin.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg">
            <Link href="/auth/register?role=business">I&apos;m a Business</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/auth/register?role=lender">I&apos;m a Lender</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4 text-center text-sm text-gray-400">
        <p>
          InvoFi — Decentralized Invoice Financing on Stellar Soroban.{' '}
          <a
            href="https://github.com/Stellar-VaultLink/invofi"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-gray-600"
          >
            Open Source
          </a>
        </p>
      </footer>
    </div>
  );
}
