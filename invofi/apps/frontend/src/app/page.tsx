import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ArrowRight, FileText, TrendingUp, Zap,
  Building2, Wallet, CheckCircle, Clock, Globe, Lock, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProtocolMetricsBand } from '@/components/common/ProtocolMetricsBand';
import { TryDemoButton } from '@/components/landing/TryDemoButton';
import { isDemoMode, isMockMode } from '@/lib/mock-mode';

export default async function LandingPage() {
  const t = await getTranslations('Landing');
  // The demo entry is shown whenever the app can serve seeded demo data —
  // either explicitly (NEXT_PUBLIC_DEMO_MODE=1) or because the whole app is
  // running on the offline mock stack (NEXT_PUBLIC_USE_MOCK=1).
  const demoMode = isDemoMode() || isMockMode();

  const HOW_IT_WORKS = [
    {
      step: '01',
      icon: FileText,
      title: t('howItWorks.step1Title'),
      description: t('howItWorks.step1Desc'),
    },
    {
      step: '02',
      icon: TrendingUp,
      title: t('howItWorks.step2Title'),
      description: t('howItWorks.step2Desc'),
    },
    {
      step: '03',
      icon: Zap,
      title: t('howItWorks.step3Title'),
      description: t('howItWorks.step3Desc'),
    },
  ];

  const FOR_BUSINESSES = [
    t('features.businessPoint1'),
    t('features.businessPoint2'),
    t('features.businessPoint3'),
    t('features.businessPoint4'),
    t('features.businessPoint5'),
  ];

  const FOR_LENDERS = [
    t('features.lenderPoint1'),
    t('features.lenderPoint2'),
    t('features.lenderPoint3'),
    t('features.lenderPoint4'),
    t('features.lenderPoint5'),
  ];

  const ASSETS = [
    {
      symbol: 'XLM',
      name: 'Stellar Lumens',
      gradient: 'from-violet-500 to-purple-600',
      description: t('assets.xlmDesc'),
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      gradient: 'from-blue-400 to-blue-600',
      description: t('assets.usdcDesc'),
    },
  ];

  const STELLAR_PROPS = [
    {
      icon: Clock,
      title: t('stellar.finalityTitle'),
      description: t('stellar.finalityDesc'),
    },
    {
      icon: Lock,
      title: t('stellar.sorobanTitle'),
      description: t('stellar.sorobanDesc'),
    },
    {
      icon: Globe,
      title: t('stellar.globalTitle'),
      description: t('stellar.globalDesc'),
    },
  ];

  const FAQS = [
    { q: t('faq.q1'), a: t('faq.a1') },
    { q: t('faq.q2'), a: t('faq.a2') },
    { q: t('faq.q3'), a: t('faq.a3') },
    { q: t('faq.q4'), a: t('faq.a4') },
    { q: t('faq.q5'), a: t('faq.a5') },
    { q: t('faq.q6'), a: t('faq.a6') },
    { q: t('faq.q7'), a: t('faq.a7') },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'InvoFi',
            url: 'https://invofi-five.vercel.app',
            applicationCategory: 'FinanceApplication',
            operatingSystem: 'Web',
            description:
              'Tokenize invoices as on-chain assets and get immediate financing from investors — powered by Stellar Soroban.',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
            },
            author: {
              '@type': 'Organization',
              name: 'InvoFi',
            },
          }),
        }}
      />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white py-28 px-4">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, white 1px, transparent 1px)', backgroundSize: '50px 50px' }} />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm mb-8 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            {t('hero.liveOnTestnet')}
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            {t('hero.titlePart1')}
            <br />
            <span className="text-blue-200">{t('hero.titlePart2')}</span>
          </h1>

          <p className="text-lg md:text-xl text-blue-100 max-w-2xl mx-auto mb-10 leading-relaxed">
            {t('hero.description')}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              asChild
              size="lg"
              className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-lg shadow-blue-900/30"
            >
              <Link href="/auth/register">
                {t('hero.getStarted')} <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/30 text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm"
            >
              <Link href="/marketplace">{t('hero.browseMarketplace')}</Link>
            </Button>

            {demoMode && (
              <TryDemoButton label={t('hero.tryDemo')} />
            )}
          </div>

          {demoMode && (
            <p className="mt-4 text-sm text-blue-200/80 flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 border border-amber-300/30 px-3 py-0.5 text-xs font-medium text-amber-100">
                {t('hero.demoTestnetOnly')}
              </span>
            </p>
          )}
        </div>
      </section>

      {/* ── Live Protocol Metrics ── */}
      <ProtocolMetricsBand />

      {/* ── How It Works ── */}
      <section className="py-24 px-4 bg-muted">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-foreground mb-4">
            {t('howItWorks.title')}
          </h2>
          <p className="text-center text-muted-foreground mb-16 max-w-xl mx-auto">
            {t('howItWorks.subtitle')}
          </p>

          <div className="grid md:grid-cols-3 gap-10">
            {HOW_IT_WORKS.map((item, i) => (
              <div key={item.step} className="relative flex flex-col items-center text-center">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-8 start-[calc(50%+2.5rem)] w-[calc(100%-2.5rem)] h-px border-t-2 border-dashed border-blue-300 dark:border-blue-700" />
                )}
                <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center mb-4 shrink-0 z-10">
                  <item.icon className="h-7 w-7 text-white" />
                </div>
                <span className="text-xs font-mono font-bold tracking-widest text-blue-500 uppercase mb-2">
                  {t('howItWorks.stepLabel', { step: item.step })}
                </span>
                <h3 className="text-lg font-semibold text-foreground mb-3">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── For Businesses / For Lenders ── */}
      <section className="py-24 px-4 bg-background">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-foreground mb-4">
            {t('features.title')}
          </h2>
          <p className="text-center text-muted-foreground mb-16 max-w-lg mx-auto">
            Whether you need working capital or want to earn yield on real-world assets, InvoFi has you covered.
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="rounded-2xl border border-border bg-card p-8 flex flex-col hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center mb-6 shrink-0">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-card-foreground mb-2">{t('features.forBusinesses')}</h3>
              <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                {t('features.forBusinessesDesc')}
              </p>
              <ul className="space-y-3 flex-1">
                {FOR_BUSINESSES.map((point) => (
                  <li key={point} className="flex gap-3 text-sm text-card-foreground">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    {point}
                  </li>
                ))}
              </ul>
              <Button asChild className="mt-8 w-full">
                <Link href="/auth/register?role=business">
                  {t('features.registerInvoiceBtn')} <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
                </Link>
              </Button>
            </div>

            <div className="rounded-2xl border border-border bg-card p-8 flex flex-col hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center mb-6 shrink-0">
                <Wallet className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-card-foreground mb-2">{t('features.forLenders')}</h3>
              <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                {t('features.forLendersDesc')}
              </p>
              <ul className="space-y-3 flex-1">
                {FOR_LENDERS.map((point) => (
                  <li key={point} className="flex gap-3 text-sm text-card-foreground">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    {point}
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" className="mt-8 w-full">
                <Link href="/marketplace">
                  {t('hero.browseMarketplace')} <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Supported Assets ── */}
      <section className="py-24 px-4 bg-muted">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4">{t('assets.title')}</h2>
          <p className="text-muted-foreground mb-12 max-w-md mx-auto">
            {t('assets.subtitle')}
          </p>

          <div className="grid sm:grid-cols-2 gap-6">
            {ASSETS.map((asset) => (
              <div
                key={asset.symbol}
                className="rounded-2xl border border-border bg-card p-8 flex gap-5 items-start text-start"
              >
                <div
                  className={`w-14 h-14 rounded-full bg-gradient-to-br ${asset.gradient} flex items-center justify-center text-white font-bold text-lg shrink-0`}
                >
                  {asset.symbol[0]}
                </div>
                <div>
                  <p className="font-bold text-card-foreground">{asset.symbol}</p>
                  <p className="text-xs text-muted-foreground mb-2">{asset.name}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{asset.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Built on Stellar ── */}
      <section className="py-24 px-4 bg-gradient-to-br from-indigo-900 via-blue-900 to-blue-800 text-white">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-block bg-white/10 border border-white/20 rounded-full px-4 py-1 text-sm mb-6 backdrop-blur-sm">
            {t('stellar.poweredBy')}
          </div>
          <h2 className="text-3xl font-bold mb-4">{t('stellar.title')}</h2>
          <p className="text-blue-200 mb-16 max-w-xl mx-auto">
            {t('stellar.subtitle')}
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {STELLAR_PROPS.map((prop) => (
              <div
                key={prop.title}
                className="bg-white/10 border border-white/10 rounded-xl p-6 text-start hover:bg-white/15 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center mb-4">
                  <prop.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-semibold mb-2">{prop.title}</h3>
                <p className="text-blue-200 text-sm leading-relaxed">{prop.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 px-4 bg-muted">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-foreground mb-4">
            {t('faq.title')}
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-md mx-auto">
            Everything you need to know about using InvoFi.
          </p>

          <div className="divide-y divide-border bg-background rounded-2xl border border-border overflow-hidden">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-medium text-foreground px-6 py-5 hover:bg-muted/50 transition-colors">
                  {faq.q}
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <p className="px-6 pb-5 text-muted-foreground text-sm leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 px-4 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white text-center">
        <h2 className="text-3xl font-bold mb-4">{t('cta.title')}</h2>
        <p className="text-blue-200 mb-8 max-w-md mx-auto">
          {t('cta.subtitle')}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg" className="bg-white text-blue-700 hover:bg-blue-50 font-semibold">
            <Link href="/auth/register?role=business">{t('cta.imBusinessBtn')}</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="border-white text-white bg-white/10 hover:bg-white/20">
            <Link href="/auth/register?role=lender">{t('cta.imLenderBtn')}</Link>
          </Button>
          {demoMode && (
            <TryDemoButton label={t('cta.tryDemo')} />
          )}
        </div>
      </section>
    </div>
  );
}
