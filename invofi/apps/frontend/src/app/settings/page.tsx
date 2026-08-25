'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ChevronRight, Copy, ExternalLink, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/components/ui/use-toast';
import { createClient } from '@/utils/supabase/client';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { DEFAULT_CURRENCY_STORAGE_KEY } from '@/lib/formatters';
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
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(contractId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Could not access the clipboard.', variant: 'destructive' });
    }
  };

  if (!contractId) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        <span className="font-medium">{label}</span>
        <span className="text-amber-600">— not configured</span>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-gray-100 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5 font-mono truncate" title={contractId}>
          {contractId}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={copyId}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 rounded-md px-2 py-1 hover:bg-gray-100 transition-colors"
          aria-label={`Copy ${label} contract ID`}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <a
          href={explorerContractUrl(contractId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 rounded-md px-2 py-1 hover:bg-gray-100 transition-colors"
          aria-label={`Open ${label} contract on Stellar Expert`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Explorer
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
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {value ? (
        <p className="text-xs text-gray-500 mt-0.5 text-right break-all max-w-[70%]" title={value}>
          {value}
        </p>
      ) : (
        <p className="text-xs text-amber-600 whitespace-nowrap">not configured</p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useLocalStorage<string>(
    DEFAULT_CURRENCY_STORAGE_KEY,
    'XLM',
  );

  const handleSignOut = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    toast({ title: 'Signed out successfully' });
    router.push('/');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <PageHeader title="Settings" description="Manage your account preferences" />

      <div className="space-y-4">
        <Link href="/profile">
          <Card className="hover:bg-accent transition-colors">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Profile</p>
                  <p className="text-xs text-gray-500 mt-0.5">Edit your display name and view account details</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Network &amp; Contracts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Stellar Network</p>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">{STELLAR_NETWORK}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Connected
              </span>
            </div>

            <div className="space-y-2.5">
              <EndpointRow label="RPC URL" value={RPC_URL} />
              <EndpointRow label="Horizon URL" value={HORIZON_URL} />
            </div>

            <div className="pt-1">
              <p className="text-sm font-medium text-gray-700 mb-2">Contracts</p>
              <div className="space-y-2">
                <ContractRow label="Registry" contractId={REGISTRY_CONTRACT_ID} />
                <ContractRow label="Financing" contractId={FINANCING_CONTRACT_ID} />
                <ContractRow label="Repayment" contractId={REPAYMENT_CONTRACT_ID} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Display</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Default display currency</p>
              <p className="text-xs text-gray-400">
                Amounts shown without an explicit currency will use this preference.
              </p>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="defaultCurrency"
                    value="XLM"
                    checked={defaultCurrency === 'XLM'}
                    onChange={() => setDefaultCurrency('XLM')}
                    className="accent-blue-600"
                  />
                  XLM
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="defaultCurrency"
                    value="USDC"
                    checked={defaultCurrency === 'USDC'}
                    onChange={() => setDefaultCurrency('USDC')}
                    className="accent-blue-600"
                  />
                  USDC
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={handleSignOut} disabled={loading}>
              {loading ? 'Signing out…' : 'Sign out'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}