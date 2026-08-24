'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/components/ui/use-toast';
import { createClient } from '@/utils/supabase/client';
import { NotificationPreferencesPanel } from '@/components/notifications/NotificationPreferencesPanel';


export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

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
            <CardTitle className="text-base">Network</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Stellar Network</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet'}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Connected
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationPreferencesPanel />
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

