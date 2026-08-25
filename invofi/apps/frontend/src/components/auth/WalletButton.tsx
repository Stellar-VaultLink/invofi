'use client';

import { useState, useEffect } from 'react';
import { Loader2, Wallet, LogOut, Copy, Check, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWallet } from './WalletProvider';
import { WalletSelectDialog } from './WalletSelectDialog';
import { formatAddress } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { getXlmBalance } from '@/lib/horizon';
import { explorerAccountUrl } from '@/lib/constants';

interface WalletButtonProps {
  onConnected?: (publicKey: string) => void;
}

export function WalletButton({ onConnected }: WalletButtonProps) {
  const {
    publicKey, isConnected, isConnecting,
    isInstalled, networkMismatch,
    isCheckingWallet,
    connect, disconnect,
  } = useWallet();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [xlmBalance, setXlmBalance] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !publicKey) { setXlmBalance(null); return; }
    getXlmBalance(publicKey)
      .then(b => setXlmBalance(parseFloat(b).toFixed(2)))
      .catch(() => setXlmBalance(null));
  }, [isConnected, publicKey]);

  const handleSelectWallet = async (walletId: string) => {
    try {
      const connectedAddress = await connect(walletId);
      setDialogOpen(false);
      if (onConnected) onConnected(connectedAddress);
    } catch (err: unknown) {
      toast({
        title: 'Wallet connection failed',
        description:
          err instanceof Error ? err.message : 'Could not connect the selected wallet.',
        variant: 'destructive',
      });
    }
  };

  const handleCopy = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      toast({
        title: 'Address copied',
        description: 'Wallet address copied to clipboard.',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not copy wallet address to clipboard.',
        variant: 'destructive',
      });
    }
  };

  if (isConnected && publicKey) {
    return (
      <div className="flex flex-col items-end gap-1">
        {networkMismatch && (
          <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md px-2.5 py-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Switch wallet to {process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet'}
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg overflow-hidden">
            <a
              href={explorerAccountUrl(publicKey)}
              target="_blank"
              rel="noopener noreferrer"
              title="View on Stellar Expert"
              className="flex items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-green-100 dark:hover:bg-green-900"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              <span className="font-mono text-green-800 dark:text-green-200">
                {formatAddress(publicKey)}
              </span>
              <ExternalLink className="h-3 w-3 text-green-500 opacity-60 shrink-0" />
            </a>
            {xlmBalance !== null && (
              <span className="text-xs text-green-700 dark:text-green-300 font-medium border-l border-green-200 dark:border-green-800 px-2 py-1.5">
                {xlmBalance} XLM
              </span>
            )}
            <button
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy full address'}
              className="px-2 py-1.5 text-sm transition-colors border-l border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900"
            >
              {copied
                ? <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                : <Copy className="h-3.5 w-3.5 text-green-500 opacity-60" />
              }
            </button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={disconnect}
            title="Disconnect wallet"
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (isCheckingWallet) {
    return (
      <Button variant="outline" disabled className="gap-2 opacity-60">
        <Loader2 className="h-4 w-4 animate-spin" />
        Wallet
      </Button>
    );
  }

  return (
    <>
      <Button
        onClick={() => setDialogOpen(true)}
        disabled={isConnecting}
        variant="outline"
        className="gap-2"
      >
        {isConnecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wallet className="h-4 w-4" />
        )}
        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
      </Button>

      <WalletSelectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSelect={handleSelectWallet}
        connecting={isConnecting}
      />
    </>
  );
}
