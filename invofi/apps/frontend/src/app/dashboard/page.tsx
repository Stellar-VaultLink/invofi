'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus, FileText, TrendingUp, Wallet, Download, LayoutGrid, List, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { InvoiceCard } from '@/components/invoices/InvoiceCard';
import { InvoiceTable } from '@/components/invoices/InvoiceTable';
import { WalletButton } from '@/components/auth/WalletButton';
import { CardSkeleton, TableSkeleton } from '@/components/common/LoadingSkeleton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { UpcomingRepaymentsWidget } from '@/components/dashboard/UpcomingRepaymentsWidget';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { getUserProfile, supabase } from '@/lib/supabase';
import { getXlmBalance } from '@/lib/horizon';
import { useWallet } from '@/components/auth/WalletProvider';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useFormat } from '@/hooks/useFormat';
import { amountToStroops } from '@/lib/utils';
import { STROOPS_PER_XLM } from '@/lib/constants';
import { toCsv, downloadCsv } from '@/lib/csv';
import type { UserProfile, Invoice } from '@/types';
import { SupabaseUser } from '@/lib/types/supabase-auth';

export default function DashboardPage() {
  const t = useTranslations('Dashboard');
  const format = useFormat();
  const router = useRouter();
  const { publicKey } = useWallet();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [xlmBalance, setXlmBalance] = useState<string | null>(null);
  const [view, setView] = useLocalStorage<'grid' | 'table'>('dashboard-invoice-view', 'grid');
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
  supabase.auth.getUser().then(async ({ data }: { data: { user: SupabaseUser | null; }; }) => {
    const { user } = data;
    if (!user) {
      // No Supabase session — AuthGuard already ensured a wallet is connected.
      // Show an empty dashboard; the user can create invoices once on-chain.
      setLoading(false);
      return;
    }
    const p = await getUserProfile(user.id);
    setProfile(p);

    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('*')
      .eq('originator_id', user.id)
      .order('created_at', { ascending: false });
    if (invoiceData) setInvoices(invoiceData as unknown as Invoice[]);
    setLoading(false);
  });
}, [router]);

  useEffect(() => {
    if (!publicKey) return;
    getXlmBalance(publicKey).then(setXlmBalance).catch(() => setXlmBalance(null));
  }, [publicKey]);

  // Default to business dashboard for wallet-only users who have no profile yet.
  const isBusiness = !profile || profile.role === 'business';

  const exportInvoicesCsv = () => {
    const rows = invoices.map(inv => ({
      ...inv,
      amount: Number(inv.amount) / STROOPS_PER_XLM,
      due_date: new Date(inv.due_date * 1000).toISOString().slice(0, 10),
    }));
    const csv = toCsv(rows, [
      { key: 'id', header: 'Invoice ID' },
      { key: 'originator', header: 'Originator' },
      { key: 'amount', header: 'Amount' },
      { key: 'currency', header: 'Currency' },
      { key: 'due_date', header: 'Due Date' },
      { key: 'status', header: 'Status' },
    ]);
    downloadCsv(`invofi-invoices-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const handleCancelInvoice = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    await supabase
      .from('invoices')
      .update({ status: 'Cancelled' })
      .eq('id', cancelTarget.id);
    setInvoices(prev =>
      prev.map(inv => inv.id === cancelTarget.id ? { ...inv, status: 'Cancelled' } : inv)
    );
    setCancelTarget(null);
    setCancelling(false);
  };

  return (
    <AuthGuard>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isBusiness ? t('titleBusiness') : t('titleLender')}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {profile?.display_name ?? t('welcomeBack')}
              {profile?.role && (
                <span className="ms-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  {t(`role.${profile.role}`)}
                </span>
              )}
            </p>
          </div>
          {isBusiness && (
            <Button asChild className="w-full sm:w-auto">
              <Link href="/invoices/new">
                <Plus className="me-2 h-4 w-4" /> {t('newInvoice')}
              </Link>
            </Button>
          )}
        </div>

        {/* Wallet panel */}
        <Card className="mb-6 border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" /> {t('wallet.title')}
            </CardTitle>
            <CardDescription>
              {publicKey
                ? t('wallet.connected')
                : t('wallet.disconnected')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4">
            <WalletButton />
            {xlmBalance !== null && (
              <span className="text-sm text-muted-foreground font-mono">
                {format.currency(amountToStroops(xlmBalance), 'XLM', { maximumFractionDigits: 2 })}
              </span>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {isBusiness ? (
            <>
              <StatCard icon={FileText} label={t('stats.totalInvoices')} value={format.number(invoices.length)} />
              <StatCard icon={FileText} label={t('stats.pending')} value={format.number(invoices.filter(i => i.status === 'Pending').length)} />
              <StatCard icon={TrendingUp} label={t('stats.financed')} value={format.number(invoices.filter(i => i.status === 'Financed').length)} />
              <StatCard icon={FileText} label={t('stats.repaid')} value={format.number(invoices.filter(i => i.status === 'Repaid').length)} />
            </>
          ) : (
            <>
              <StatCard icon={TrendingUp} label={t('stats.activeInvestments')} value={format.number(0)} />
              <StatCard icon={TrendingUp} label={t('stats.pendingOffers')} value={format.number(0)} />
              <StatCard icon={FileText} label={t('stats.repaid')} value={format.number(0)} />
              <StatCard icon={TrendingUp} label={t('stats.totalYield')} value="—" />
            </>
          )}
        </div>

        {/* Upcoming repayments (originators only) */}
        {isBusiness && !loading && invoices.length > 0 && (
          <UpcomingRepaymentsWidget invoices={invoices} />
        )}

        {/* Activity feed — recent protocol events */}
        {!loading && <ActivityFeed />}

        {/* Invoices / offers */}
        {isBusiness && (
          <section>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-foreground">{t('yourInvoices')}</h2>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {invoices.length > 0 && !loading && (
                  <div className="flex items-center rounded-md border border-border">
                    <button
                      onClick={() => setView('grid')}
                      className={`p-2 rounded-s-md ${view === 'grid' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      title={t('view.grid')}
                      aria-label={t('view.grid')}
                      aria-pressed={view === 'grid'}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setView('table')}
                      className={`p-2 rounded-e-md border-s border-border ${view === 'table' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      title={t('view.table')}
                      aria-label={t('view.table')}
                      aria-pressed={view === 'table'}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {invoices.length > 0 && !loading && (
                  <Button variant="outline" size="sm" onClick={exportInvoicesCsv} className="whitespace-nowrap">
                    <Download className="me-1.5 h-3.5 w-3.5" /> {t('exportCsv')}
                  </Button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="grid md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-border rounded-xl">
                <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground mb-4">{t('empty.invoices')}</p>
                <Button asChild>
                  <Link href="/invoices/new">
                    <Plus className="me-2 h-4 w-4" /> {t('empty.createFirst')}
                  </Link>
                </Button>
              </div>
            ) : view === 'table' ? (
              <InvoiceTable
                invoices={invoices}
                onRowClick={inv => router.push(`/invoices/${inv.id}`)}
              />
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {invoices.map(inv => (
                  <div key={inv.id} className="relative group">
                    <InvoiceCard invoice={inv} href={`/invoices/${inv.id}`} />
                    {inv.status === 'Pending' && (
                      <button
                        onClick={() => setCancelTarget(inv)}
                        className="absolute top-3 end-3 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-red-50 dark:bg-red-950 text-red-500 hover:bg-red-100 dark:hover:bg-red-900"
                        title={t('cancel.action')}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {!isBusiness && (
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-4">{t('yourInvestments')}</h2>
            <div className="text-center py-16 border-2 border-dashed border-border rounded-xl">
              <TrendingUp className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">{t('empty.investments')}</p>
              <Button asChild>
                <Link href="/marketplace">{t('browseMarketplace')}</Link>
              </Button>
            </div>
          </section>
        )}
      </div>

      {/* Cancel confirmation */}
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={open => { if (!open) setCancelTarget(null); }}
        title={t('cancel.title')}
        description={t('cancel.description', { id: cancelTarget?.id ?? '' })}
        confirmLabel={t('cancel.confirm')}
        variant="destructive"
        holdToConfirm
        onConfirm={handleCancelInvoice}
        loading={cancelling}
      />
    </AuthGuard>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <Icon className="h-4 w-4 text-muted-foreground mb-2" />
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
