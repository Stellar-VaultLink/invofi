'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useWallet } from '@/components/auth/WalletProvider';
import { formatWalletAddress } from '@/lib/formatters';
import { SupabaseUser } from '@/lib/types/supabase-auth';


export default function ProfilePage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
   supabase.auth.getUser().then(({ data }: { data: { user: SupabaseUser | null } }) => {
  if (!data.user) {
    router.push('/auth/login');
    return;
  }
  setEmail(data.user.email ?? '');
  setDisplayName(data.user.user_metadata?.display_name ?? '');
});
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await supabase.auth.updateUser({ data: { display_name: displayName } });
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <PageHeader title="Profile" description="Manage your account details" />
      <form onSubmit={handleSave} className="mt-8 space-y-6">
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span className="font-medium">{email || '—'}</span>
          </div>
          {publicKey && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Wallet className="h-4 w-4" />
              <span className="font-mono text-xs">{formatWalletAddress(publicKey)}</span>
            </div>
          )}
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium mb-1">
              Display name
            </label>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="Your name"
              />
            </div>
          </div>
        </div>
        <Button type="submit" disabled={loading}>
          {saved ? 'Saved!' : loading ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </main>
  );
}
