'use client';

/**
 * One-time profile setup (issue #380, ADR-0008 Amendment 001).
 *
 * Reached after a successful wallet sign-in when the session's
 * `hasProfile` is not yet true: the user picks their immutable public
 * handle (username), their role (business or lender), and — for businesses
 * — the business name shown across the marketplace. Under the legacy
 * Supabase backend (`NEXT_PUBLIC_AUTH_BACKEND !== 'authjs'`) this page is
 * inert and redirects home: the new columns only exist in the #375/#376
 * migration chain, and the live Supabase stack must stay untouched until
 * the #102 cutover.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getAuthBackend, getWalletSessionUser } from '@/lib/auth/client';
import { validateUsername } from '@/lib/auth/username';
import { useToast } from '@/components/ui/use-toast';

type Phase = 'checking' | 'needs-auth' | 'ready' | 'saving' | 'done';

export default function ProfileSetupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('checking');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'business' | 'lender'>('business');
  const [businessName, setBusinessName] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Resolve the Auth.js session. A session without `hasProfile` lands on the
  // form; everything else is redirected (no session → login, done → home).
  useEffect(() => {
    if (getAuthBackend() !== 'authjs') {
      router.replace('/dashboard');
      return;
    }
    let cancelled = false;
    getWalletSessionUser().then((user) => {
      if (cancelled) return;
      if (!user) {
        router.replace('/auth/login');
        return;
      }
      setWalletAddress(user.walletAddress ?? null);
      if (user.hasProfile || user.username) {
        router.replace('/dashboard');
        return;
      }
      setPhase('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const submit = useCallback(async () => {
    setClientError(null);
    setServerError(null);

    const check = validateUsername(username);
    if (!check.ok) {
      setClientError(check.error ?? 'Invalid username.');
      return;
    }
    if (role === 'business' && businessName.trim().length === 0) {
      setClientError('Business accounts need a business name.');
      return;
    }

    setPhase('saving');
    try {
      const res = await fetch('/api/profile/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: check.username,
          role,
          displayName: role === 'business' ? businessName.trim() : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setServerError(body.error ?? 'Could not save your profile. Please try again.');
        setPhase('ready');
        return;
      }
      setPhase('done');
      toast({
        title: 'Profile ready',
        description: `Welcome to InvoFi, @${check.username}!`,
      });
      // Full reload so server components/RSC caches pick up the new session
      // extras (username/role/hasProfile) — router.refresh alone can serve
      // the stale RSC payload for the dashboard.
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setServerError('Network error — please try again.');
      setPhase('ready');
    }
  }, [username, role, businessName, router, toast]);

  if (phase === 'checking') {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 bg-gray-50 dark:bg-gray-950">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12 bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            Set up your profile
          </h1>
          <p className="text-gray-500 dark:text-gray-500 mt-1">
            One last step — choose how you appear on InvoFi
          </p>
        </div>

        <Card className="border-2 border-blue-100 dark:border-blue-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Wallet verified
            </CardTitle>
            <CardDescription>
              Signed in with your Stellar wallet
              {walletAddress ? (
                <>
                  {' '}
                  <span className="font-mono">
                    {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                  </span>
                </>
              ) : null}
              . This address is your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Role selection */}
            <div className="space-y-1.5">
              <Label>I am joining as</Label>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account role">
                {(['business', 'lender'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={role === r}
                    onClick={() => setRole(r)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      role === r
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900'
                    }`}
                  >
                    {r === 'business' ? 'Business' : 'Lender'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {role === 'business'
                  ? 'Create invoices and raise financing against them.'
                  : 'Browse invoices and fund businesses directly.'}
              </p>
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <span className="absolute inset-y-0 start-3 flex items-center text-gray-400 pointer-events-none">
                  @
                </span>
                <Input
                  id="username"
                  className="ps-8"
                  placeholder="satoshi_trader"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                3–30 characters — lowercase letters, numbers, &quot;-&quot; or
                &quot;_&quot;. <strong>Permanent</strong> — it cannot be changed later.
              </p>
              {clientError && (
                <p className="text-xs text-red-500" role="alert">
                  {clientError}
                </p>
              )}
              {serverError && (
                <p className="text-xs text-red-500" role="alert">
                  {serverError}
                </p>
              )}
            </div>

            {/* Business name (required for business accounts) */}
            {role === 'business' && (
              <div className="space-y-1.5">
                <Label htmlFor="businessName">Business name</Label>
                <Input
                  id="businessName"
                  placeholder="Acme Manufacturing Ltd."
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  maxLength={80}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Shown on your invoices across the marketplace.
                </p>
              </div>
            )}

            <Button
              type="button"
              className="w-full"
              onClick={submit}
              disabled={phase === 'saving' || phase === 'done'}
            >
              {phase === 'saving' ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="me-2 h-4 w-4" />
              )}
              {phase === 'saving' ? 'Saving…' : 'Finish setup'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
