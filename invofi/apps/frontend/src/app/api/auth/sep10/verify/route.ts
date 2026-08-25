import { NextRequest, NextResponse } from 'next/server';
import {
  verifySep10Challenge,
  getSep10HomeDomain,
  getSep10WebAuthDomain,
  getServerNetworkPassphrase,
} from '@/lib/sep10-server';
import { createAdminClient } from '@/utils/supabase/admin';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { claimSep10ChallengeHash } from '@/lib/sep10-replay-guard';

export const runtime = 'nodejs';

const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Derives a stable, deterministic Supabase identity for a verified Stellar
 * wallet address. Mirrors the convention already used by the blind-trust
 * fallback in `lib/supabase.ts` (`signInWithWallet`), so the same wallet
 * resolves to the same Supabase user whether it signed in via SEP-10 or via
 * the legacy path.
 */
function walletEmail(account: string): string {
  return `${account.toLowerCase()}@stellar.wallet`;
}

/**
 * POST /api/auth/sep10/verify
 * Body: `{ transaction: string }` — the SEP-10 challenge XDR, signed by both
 * the server (already, from the challenge step) and the client's wallet.
 *
 * On success: verifies the client actually controls the claimed Stellar
 * account, then mints a real Supabase session for it via the admin
 * (service-role) client and returns a one-time token hash the browser
 * exchanges for a session with `supabase.auth.verifyOtp`.
 *
 * On any failure: 401, with no stack trace or secret material in the
 * response body. This endpoint never falls back to trusting an unverified
 * address.
 */
export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`sep10-verify:${clientIp}`, {
    limit: RATE_LIMIT,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    console.warn(`SEP-10 verify rate limit exceeded for IP ${clientIp}`);
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const transaction = (body as { transaction?: unknown } | null)?.transaction;
  if (typeof transaction !== 'string' || !transaction) {
    return NextResponse.json(
      { error: 'A signed challenge transaction is required.' },
      { status: 400 },
    );
  }

  const serverSecret = process.env.SEP10_SERVER_SIGNING_SECRET;
  if (!serverSecret) {
    console.error('SEP-10 verify requested but SEP10_SERVER_SIGNING_SECRET is unset.');
    return NextResponse.json(
      { error: 'Wallet sign-in is not configured on this server.' },
      { status: 500 },
    );
  }

  let clientAccountId: string;
  let transactionHash: string;
  try {
    const result = verifySep10Challenge({
      signedTransactionXdr: transaction,
      serverSecret,
      homeDomain: getSep10HomeDomain(),
      webAuthDomain: getSep10WebAuthDomain(),
      networkPassphrase: getServerNetworkPassphrase(),
    });
    clientAccountId = result.clientAccountId;
    transactionHash = result.transactionHash;
  } catch (err) {
    // Log the real reason server-side only; the client only learns "failed".
    console.error('SEP-10 challenge verification failed:', err);
    return NextResponse.json(
      { error: 'Wallet signature verification failed.' },
      { status: 401 },
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error('Supabase admin client unavailable:', err);
    return NextResponse.json(
      { error: 'Wallet sign-in is not configured on this server.' },
      { status: 500 },
    );
  }

  // Single-use enforcement (Task 103 review): a validly-signed challenge
  // must still be rejected on a second submission — otherwise a captured
  // signed challenge (e.g. from a compromised network hop before TLS, or a
  // browser history/log leak) stays replayable for its entire validity
  // window. This must happen before minting anything below.
  let isFirstUse: boolean;
  try {
    isFirstUse = await claimSep10ChallengeHash(admin, transactionHash);
  } catch (err) {
    console.error('Failed to record SEP-10 challenge usage:', err);
    return NextResponse.json(
      { error: 'Could not verify the wallet signature.' },
      { status: 500 },
    );
  }
  if (!isFirstUse) {
    console.warn('SEP-10 challenge replay detected for account', clientAccountId);
    return NextResponse.json(
      { error: 'Wallet signature verification failed.' },
      { status: 401 },
    );
  }

  const email = walletEmail(clientAccountId);

  // `generateLink` creates the auth user on first use (type: 'magiclink')
  // and returns a token hash the client can redeem for a real session via
  // `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })` — this is
  // how we mint a session server-side for an identity that was verified by
  // Stellar signature rather than by a password or an email click.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError || !linkData?.properties?.hashed_token || !linkData.user) {
    console.error('Failed to mint a Supabase session for verified wallet:', linkError);
    return NextResponse.json(
      { error: 'Could not establish a session for the verified wallet.' },
      { status: 500 },
    );
  }

  const userId = linkData.user.id;

  // Get-or-create the profile row and bind the *verified* wallet address to
  // it. NOTE (schema assumption): this requires a `wallet_verified boolean`
  // column on `user_profiles` in the Supabase schema — there is no
  // migrations directory in this repo to add it automatically, so it must
  // be added by hand (see docs/05-authentication.md and
  // docs/08-environment-variables.md for the exact column definition).
  const { data: existingProfile } = await admin
    .from('user_profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (existingProfile) {
    const { error: updateError } = await admin
      .from('user_profiles')
      .update({ wallet_address: clientAccountId, wallet_verified: true })
      .eq('id', userId);
    if (updateError) {
      console.warn('Failed to update profile wallet fields:', updateError.message);
    }
  } else {
    const { error: insertError } = await admin.from('user_profiles').insert({
      id: userId,
      email,
      role: 'business',
      display_name: null,
      wallet_address: clientAccountId,
      wallet_verified: true,
    });
    if (insertError) {
      console.warn('Failed to create profile for verified wallet:', insertError.message);
    }
  }

  return NextResponse.json({
    account: clientAccountId,
    email,
    tokenHash: linkData.properties.hashed_token,
  });
}
