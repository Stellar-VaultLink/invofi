import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth/config';
import { isAuthjsBackendEnabled } from '@/lib/auth/enabled';
import { getProfileByWallet } from '@/lib/auth/profile';

export const runtime = 'nodejs';

/**
 * GET /api/profile/me — the signed-in wallet's profile row (issue #380).
 *
 * Used by the one-time setup page (does this wallet still need setup?) and by
 * settings (what is my current role / display name / handle?). Returns
 * `{ profile: null }` for a valid session whose profile row has not been
 * provisioned yet — the client treats null + `hasProfile !== true` as
 * "needs setup".
 */
export async function GET(_req: NextRequest) {
  // Backend gate: on legacy-Supabase deployments there is no Auth.js session
  // (and auth() would throw MissingSecret) — answer 401 like any other
  // unauthenticated request instead of 500.
  if (!isAuthjsBackendEnabled()) {
    return NextResponse.json({ error: 'Sign in with your wallet first.' }, { status: 401 });
  }

  const session = await auth();
  const wallet = session?.user?.walletAddress;
  if (!session || !wallet) {
    return NextResponse.json({ error: 'Sign in with your wallet first.' }, { status: 401 });
  }

  try {
    const profile = await getProfileByWallet(wallet);
    return NextResponse.json({
      profile: profile
        ? {
            id: profile.id,
            username: profile.username,
            role: profile.role,
            displayName: profile.display_name,
            needsSetup: profile.username === null,
          }
        : null,
    });
  } catch (err) {
    console.error('profile/me failed:', err);
    return NextResponse.json(
      { error: 'Could not load your profile. Please try again.' },
      { status: 500 },
    );
  }
}
