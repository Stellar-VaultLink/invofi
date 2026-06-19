'use client';

import { Loader2, Wallet, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWallet } from './WalletProvider';
import { formatAddress } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface WalletButtonProps {
  onConnected?: (publicKey: string) => void;
}

export function WalletButton({ onConnected }: WalletButtonProps) {
  const { publicKey, isConnected, isConnecting, connect, disconnect } = useWallet();
  const { toast } = useToast();

  const handleConnect = async () => {
    try {
      await connect();
      if (onConnected && publicKey) onConnected(publicKey);
    } catch (err: unknown) {
      toast({
        title: 'Wallet connection failed',
        description:
          err instanceof Error
            ? err.message
            : 'Make sure the Freighter extension is installed.',
        variant: 'destructive',
      });
    }
  };

  if (isConnected && publicKey) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="font-mono text-green-800">{formatAddress(publicKey)}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={disconnect}
          className="text-gray-400 hover:text-gray-600"
          title="Disconnect wallet"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={handleConnect} disabled={isConnecting} variant="outline" className="gap-2">
      {isConnecting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Wallet className="h-4 w-4" />
      )}
      {isConnecting ? 'Connecting…' : 'Connect Freighter'}
    </Button>
  );
}
