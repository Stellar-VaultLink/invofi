'use client';

// AdminGuard — wraps the /dashboard/health page (and any other admin-only
// content) and redirects to /403 if the authenticated user does not have
// `role = 'admin'` in user_profiles.
//
// Extends AuthGuard: it first requires a Supabase session, then checks the
// admin role.  Renders a spinner while the checks are in flight so there is no
// visible flash of content.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldX } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AdminGuardProps {
  children: React.ReactNode;
}

type CheckState = 'loading' | 'allowed' | 'forbidden' | 'unauthenticated';

export function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter();
  const [state, setState] = useState<CheckState>('loading');

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // 1. Require a valid Supabase session.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) setState('unauthenticated');
        return;
      }

      // 2. Check role in user_profiles.
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error || !profile || profile.role !== 'admin') {
        setState('forbidden');
      } else {
        setState('allowed');
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  // Redirect effects — run after render so Next.js router is ready.
  useEffect(() => {
    if (state === 'unauthenticated') router.push('/auth/login');
    if (state === 'forbidden') router.push('/403');
  }, [state, router]);

  if (state === 'loading') {
    return (
      <div
        className="flex items-center justify-center min-h-[60vh]"
        role="status"
        aria-label="Checking admin access"
      >
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // Prevent flash while the router is redirecting.
  if (state === 'forbidden' || state === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <ShieldX className="h-8 w-8" />
        <p className="text-sm">Access denied — redirecting…</p>
      </div>
    );
  }

  return <>{children}</>;
}
