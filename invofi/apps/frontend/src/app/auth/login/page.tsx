'use client';

/**
 * Login page (issue #380 — wallet-first onboarding).
 *
 * Two backends coexist until the #102 cutover:
 *  - `authjs`    — wallet-only: the email/password card and register link are
 *                  hidden, sign-in proves the wallet via SEP-10, and routing
 *                  lands on the one-time profile setup when the session has
 *                  no username yet.
 *  - `supabase`  — the legacy dual-mode page (email card + wallet card).
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WalletButton } from '@/components/auth/WalletButton';
import { signInWithEmail, getSupabaseClient } from '@/lib/supabase';
import { loginWithSep10 } from '@/lib/sep10';
import {
  getAuthBackend,
  getWalletSessionUser,
  routeAfterSignIn,
} from '@/lib/auth/client';
import { useToast } from '@/components/ui/use-toast';
import { useWallet } from '@/components/auth/WalletProvider';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [verifyingWallet, setVerifyingWallet] = useState(false);
  const { disconnect } = useWallet();

  // Wallet-only under the new backend: no email card, no register link.
  const isWalletOnly = getAuthBackend() === 'authjs';

  // Redirect once a session exists. Keyed on the session rather than wallet
  // connectivity (issue #237 review) — WalletButton's connect() flips
  // `isConnected` before SEP-10 verification finishes, so a connectivity-based
  // redirect would send an unverified wallet straight to the dashboard.
  useEffect(() => {
    let cancelled = false;
    if (isWalletOnly) {
      getWalletSessionUser().then(async (user) => {
        if (cancelled || !user) return;
        // Profile-aware routing (#380): first sign-in lands on the one-time
        // setup step, everyone else goes to the dashboard.
        router.replace(await routeAfterSignIn('/dashboard'));
      });
      return () => {
        cancelled = true;
      };
    }
    getSupabaseClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled && data.session) router.replace('/dashboard');
      });
    return () => {
      cancelled = true;
    };
  }, [router, isWalletOnly]);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  // Explicit wallet login (issue #103): connecting a wallet here is not
  // enough on its own — the login page only redirects after the address has
  // been proven via a signed SEP-10 challenge. A rejected or failed
  // signature keeps the user on this page with an error, even though the
  // wallet itself may already show as "connected" for signing purposes.
  // (Under `authjs` the provider deliberately skips its own session call on
  // /auth/* pages — this handler is the single, supervised sign-in path.)
  const handleWalletConnected = async (publicKey: string) => {
    setVerifyingWallet(true);
    try {
      await loginWithSep10(publicKey);
      router.push(await routeAfterSignIn('/dashboard'));
    } catch (err: unknown) {
      // Drop the unverified connection — otherwise the wallet stays
      // "connected" after a rejected/failed signature with nothing to
      // distinguish it from a verified session.
      disconnect();
      toast({
        title: 'Wallet sign-in failed',
        description:
          err instanceof Error
            ? err.message
            : 'Could not verify wallet ownership — please try again.',
        variant: 'destructive',
      });
    } finally {
      setVerifyingWallet(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      await signInWithEmail(values.email, values.password);
      router.push('/dashboard');
    } catch (err: unknown) {
      toast({
        title: 'Login failed',
        description: err instanceof Error ? err.message : 'Invalid credentials',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12 bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Welcome back</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Sign in to your InvoFi account</p>
        </div>

        {/* Wallet login — the only sign-in method under `authjs`; the primary
            method under `supabase`. Connecting prompts a SEP-10 challenge
            signature so the session is bound to a *verified* wallet, not
            merely a claimed address (see docs/05-authentication.md). */}
        <Card className="border-2 border-blue-100 dark:border-blue-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sign in with Wallet</CardTitle>
            <CardDescription>
              Connect your Stellar wallet, then sign a one-time challenge to prove ownership —
              no password needed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WalletButton onConnected={handleWalletConnected} />
            {verifyingWallet && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Waiting for wallet signature…
              </p>
            )}
          </CardContent>
        </Card>

        {/* Email login — legacy Supabase backend only (ADR-0008 Amendment 001
            removes email/password once the authjs backend is the default). */}
        {!isWalletOnly && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-gray-50 dark:bg-gray-950 px-2 text-gray-400 dark:text-gray-500">or sign in with email</span>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="you@company.com" {...register('email')} />
                    {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" placeholder="••••••••" {...register('password')} />
                    {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    Sign In
                  </Button>
                </form>
              </CardContent>
            </Card>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              Don&apos;t have an account?{' '}
              <Link href="/auth/register" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                Create one
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
