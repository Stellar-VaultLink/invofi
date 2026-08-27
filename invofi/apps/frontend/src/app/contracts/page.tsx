'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, Network } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/components/ui/use-toast';
import {
  FINANCING_CONTRACT_ID,
  REGISTRY_CONTRACT_ID,
  REPAYMENT_CONTRACT_ID,
  STELLAR_NETWORK,
  explorerContractUrl,
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

/** Public "Contract addresses" page (issue #129). Unlike the settings panel,
 *  this is a standalone, directly-linkable page for transparency: anyone can
 *  see which contract instances the deployment is wired to and verify them on
 *  Stellar Expert without opening settings. */
export default function ContractsPage() {
  const hasAnyContract =
    Boolean(REGISTRY_CONTRACT_ID) || Boolean(FINANCING_CONTRACT_ID) || Boolean(REPAYMENT_CONTRACT_ID);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <PageHeader
        title="Contract Addresses"
        description="The on-chain contract instances this deployment is wired to. Verify each ID on Stellar Expert."
      />

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-blue-500" />
              <p className="text-sm font-medium text-gray-700">Stellar Network</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {STELLAR_NETWORK}
            </span>
          </div>

          <div className="pt-1">
            <p className="text-sm font-medium text-gray-700 mb-2">Contracts</p>
            {hasAnyContract ? (
              <div className="space-y-2">
                <ContractRow label="Registry" contractId={REGISTRY_CONTRACT_ID} />
                <ContractRow label="Financing" contractId={FINANCING_CONTRACT_ID} />
                <ContractRow label="Repayment" contractId={REPAYMENT_CONTRACT_ID} />
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                No contract addresses are configured for this deployment.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
