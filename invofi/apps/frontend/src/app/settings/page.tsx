'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, ChevronRight, Copy, ExternalLink, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/common/PageHeader';
import { LanguageSwitcher } from '@/components/settings/LanguageSwitcher';
import { useToast } from '@/components/ui/use-toast';
import { createClient } from '@/utils/supabase/client';
import {
  EXPLORER_BASE,
  FINANCING_CONTRACT_ID,
  HORIZON_URL,
  REGISTRY_CONTRACT_ID,
  REPAYMENT_CONTRACT_ID,
  RPC_URL,
  STELLAR_NETWORK,
} from '@/lib/constants';

interface ContractRowProps {
  /** Human-readable label for the contract, e.g. "Registry". */
  label: string;
  /** Contract ID from env; empty means the deployment omitted it. */
  contractId: string;
}

/** One contract row: ID + copy button + Stellar Expert deep link, or a "not
 *  configured" warning when the env var is missing. */
function ContractRow({ label, contractId }: ContractRowProps) {
  const t = useTranslations('Settings.contracts');
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(contractId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: t('copyFailed'), description: t('copyFailedHint'), variant: 'destructive' });
    }
  };

  if (!contractId) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800">
        <span className="font-medium">{label}</span>
        <span className="text-amber-600 dark:text-amber-500">— {t('notConfigured')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-gray-100 px-3 py-2 dark:border-gray-800">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
        {/* Contract IDs are base32 identifiers — pinned LTR so they read
            correctly inside an RTL layout. */}
        <p className="text-xs text-gray-500 mt-0.5 font-mono truncate dark:text-gray-400" dir="ltr" title={contractId}>
          {contractId}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={copyId}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 rounded-md px-2 py-1 hover:bg-gray-100 transition-colors dark:text-gray-400 dark:hover:text-gray-50 dark:hover:bg-gray-800"
          aria-label={t('copyAria', { label })}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t('copied') : t('copy')}
        </button>
        <a
          href={explorerContractUrl(contractId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 rounded-md px-2 py-1 hover:bg-gray-100 transition-colors dark:text-gray-400 dark:hover:text-gray-50 dark:hover:bg-gray-800"
          aria-label={t('explorerAria', { label })}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t('explorer')}
        </a>
      </div>
    </div>
  );
}

const explorerContractUrl = (contractId: string) => `${EXPLORER_BASE}/contract/${contractId}`;

interface EndpointRowProps {
  label: string;
  value: string;
}

/** Endpoint row: shows the value or an explicit "not configured" warning. */
function EndpointRow({ label, value }: EndpointRowProps) {
  const t = useTranslations('Settings.contracts');
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
      {value ? (
        <p className="text-xs text-gray-500 mt-0.5 text-end break-all max-w-[70%] dark:text-gray-400" dir="ltr" title={value}>
          {value}
        </p>
      ) : (
        <p className="text-xs text-amber-600 whitespace-nowrap dark:text-amber-500">{t('notConfigured')}</p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const t = useTranslations('Settings');
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    toast({ title: t('account.signedOut') });
    router.push('/');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <PageHeader title={t('title')} description={t('description')} />

      <div className="space-y-4">
        <Link href="/profile">
          <Card className="hover:bg-accent transition-colors">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('profile.label')}</p>
                  <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">{t('profile.hint')}</p>
                </div>
              </div>
              {/* Chevrons point "forward", which is leftwards in RTL. */}
              <ChevronRight className="h-4 w-4 text-gray-400 rtl:rotate-180 dark:text-gray-500" />
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('language.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <LanguageSwitcher />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('network.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('network.label')}</p>
                <p className="text-xs text-gray-500 mt-0.5 capitalize dark:text-gray-400">{STELLAR_NETWORK}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {t('network.connected')}
              </span>
            </div>

            <div className="space-y-2.5">
              <EndpointRow label={t('contracts.rpcUrl')} value={RPC_URL} />
              <EndpointRow label={t('contracts.horizonUrl')} value={HORIZON_URL} />
            </div>

            <div className="pt-1">
              <p className="text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">{t('contracts.title')}</p>
              <div className="space-y-2">
                <ContractRow label={t('contracts.registry')} contractId={REGISTRY_CONTRACT_ID} />
                <ContractRow label={t('contracts.financing')} contractId={FINANCING_CONTRACT_ID} />
                <ContractRow label={t('contracts.repayment')} contractId={REPAYMENT_CONTRACT_ID} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('account.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={handleSignOut} disabled={loading}>
              {loading ? t('account.signingOut') : t('account.signOut')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}