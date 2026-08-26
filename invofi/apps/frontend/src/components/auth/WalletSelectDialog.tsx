'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { APPROVED_WALLETS, WALLET_IDS } from '@/lib/approved-wallets';

interface WalletSelectDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (walletId: string) => void;
  connecting: boolean;
}

interface WalletOption {
  id: string;
  name: string;
  description: string;
  installUrl: string;
  installed: boolean | null;
  logo: React.ReactNode;
}

const FreighterLogo = () => (
  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
    F
  </div>
);

const LobstrLogo = () => (
  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
    L
  </div>
);

const AlbedoLogo = () => (
  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
    A
  </div>
);

const LOGOS: Record<string, React.ReactNode> = {
  [WALLET_IDS.freighter]: <FreighterLogo />,
  [WALLET_IDS.lobstr]: <LobstrLogo />,
  [WALLET_IDS.albedo]: <AlbedoLogo />,
};

export function WalletSelectDialog({
  open,
  onClose,
  onSelect,
  connecting,
}: WalletSelectDialogProps) {
  // The list is driven entirely by the approved-wallets allowlist, so a newly
  // approved wallet appears here automatically.
  const [wallets, setWallets] = useState<WalletOption[]>(() =>
    APPROVED_WALLETS.map(w => ({
      id: w.id,
      name: w.name,
      description: w.description,
      installUrl: w.installUrl,
      installed: null,
      logo: LOGOS[w.id] ?? null,
    })),
  );

  useEffect(() => {
    if (!open) return;
    APPROVED_WALLETS.forEach(w =>
      w.isInstalled().then(installed => {
        setWallets(prev =>
          prev.map(o => (o.id === w.id ? { ...o, installed } : o)),
        );
      }),
    );
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Choose a Stellar wallet to connect.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-2">
          {wallets.map(wallet => {
            const isReady = wallet.installed === true;
            const isChecking = wallet.installed === null;

            return (
              <div
                key={wallet.id}
                className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card"
              >
                {wallet.logo}

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-card-foreground text-sm">{wallet.name}</p>
                  <p className="text-xs text-muted-foreground">{wallet.description}</p>
                  {wallet.installed === false && (
                    <a
                      href={wallet.installUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline mt-0.5"
                    >
                      Install extension <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                {isChecking ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                ) : isReady ? (
                  <Button
                    size="sm"
                    disabled={connecting}
                    onClick={() => onSelect(wallet.id)}
                  >
                    {connecting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      'Connect'
                    )}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled className="opacity-50">
                    Not found
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground text-center pt-1">
          Approved wallets connect via the Stellar Wallets Kit.
        </p>
      </DialogContent>
    </Dialog>
  );
}
