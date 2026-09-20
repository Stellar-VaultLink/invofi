'use client';

/**
 * Profile editor card (issue #380 settings slice, ADR-0008 Amendment 001).
 *
 * Rendered inside the settings page under the `authjs` backend: edits the
 * display name and switches the account role. The username is shown
 * read-only with an explicit "permanent" note — immutability is a product
 * decision, and the server rejects username changes regardless of UI.
 *
 * Under the legacy Supabase backend this component is not mounted; the
 * settings page keeps its profile link card instead.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AtSign, Loader2, UserRoundCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { getAuthBackend } from '@/lib/auth/backend';

type Role = 'business' | 'lender' | 'admin';

export function ProfileEditor() {
  const t = useTranslations('Settings.profileEditor');
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('business');
  const [savedName, setSavedName] = useState('');
  const [savedRole, setSavedRole] = useState<Role>('business');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the current profile once. /api/profile/me is session-gated — a 401
  // response means no valid session, which renders as "not ready" (the
  // AuthGuard already guarantees a session for /settings visitors).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/profile/me');
        if (!res.ok) return;
        const body = (await res.json()) as {
          profile: { username: string | null; role: Role; displayName: string | null } | null;
        };
        if (cancelled || !body.profile) return;
        setUsername(body.profile.username);
        setRole(body.profile.role);
        setSavedRole(body.profile.role);
        setDisplayName(body.profile.displayName ?? '');
        setSavedName(body.profile.displayName ?? '');
        setReady(true);
      } catch {
        // Leave the card unrendered rather than half-configured.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = displayName !== savedName || role !== savedRole;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          ...(role !== savedRole ? { role } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; displayName?: string; role?: Role };
      if (!res.ok) {
        setError(body.error ?? 'Could not save your changes. Please try again.');
        return;
      }
      // Server returns the authoritative row.
      setSavedName(body.displayName ?? '');
      setDisplayName(body.displayName ?? '');
      if (body.role) {
        setRole(body.role);
        setSavedRole(body.role);
      }
      toast({ title: t('updated') });
      // Refresh RSC caches so header/marketplace copies of the name update.
      window.location.reload();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (getAuthBackend() !== 'authjs' || !ready) return null;

  return (
    <div className="space-y-5">
      {/* Read-only identity row: wallet + immutable handle */}
      <div className="flex items-start justify-between gap-3 rounded-md border border-gray-100 px-3 py-2 dark:border-gray-800">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <AtSign className="h-3.5 w-3.5 text-gray-400" />
            {username ?? '—'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
            {t('usernamePermanent')}
          </p>
        </div>
      </div>

      {/* Display name */}
      <div className="space-y-1.5">
        <Label htmlFor="displayName">{t('displayNameLabel')}</Label>
        <Input
          id="displayName"
          placeholder={role === 'business' ? 'Acme Manufacturing Ltd.' : 'How lenders see you'}
          value={displayName}
          maxLength={80}
          onChange={e => setDisplayName(e.target.value)}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {role === 'business' ? t('displayNameBusinessHint') : t('displayNameLenderHint')}
        </p>
      </div>

      {/* Role switch */}
      <div className="space-y-1.5">
        <Label>{t('roleLabel')}</Label>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('roleLabel')}>
          {(['business', 'lender'] as const).map(r => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              onClick={() => setRole(r)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                role === r
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900',
              )}
            >
              {r === 'business' ? t('roleBusiness') : t('roleLender')}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {role === 'business' ? t('roleBusinessHint') : t('roleLenderHint')}
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}

      <Button type="button" onClick={save} disabled={saving || !dirty} className="w-full sm:w-auto">
        {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <UserRoundCog className="me-2 h-4 w-4" />}
        {saving ? t('saving') : t('save')}
      </Button>
    </div>
  );
}
