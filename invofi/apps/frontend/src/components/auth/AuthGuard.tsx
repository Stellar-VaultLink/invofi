'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useWallet } from '@/components/auth/WalletProvider';

interface AuthGuardProps {
  children: React.ReactNode;
  isUnauthorized?: boolean;
}

export function AuthGuard({ children, isUnauthorized }: AuthGuardProps) {
  const router = useRouter();
  const { isConnected, isCheckingWallet } = useWallet();
  const [sessionReady, setSessionReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setHasSession(!!user);
      setSessionReady(true);
    });
  }, [router]);

  useEffect(() => {
    if (sessionReady && !isCheckingWallet && isUnauthorized) {
      router.push('/403');
    }
  }, [sessionReady, isCheckingWallet, isUnauthorized, router]);

  // Wait for both the Supabase check AND the wallet init to finish.
  if (!sessionReady || isCheckingWallet) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  if (isUnauthorized) {
    return null;
  }

  // Accept either a Supabase session OR a connected wallet as valid auth.
  // This lets wallet-only users access the app even if anonymous Supabase
  // auth is not enabled on the project.
  if (!hasSession && !isConnected) {
    router.push('/auth/login');
    return null;
  }

  return <>{children}</>;
}
