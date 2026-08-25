import { NextRequest, NextResponse } from 'next/server';
import { StrKey } from '@stellar/stellar-sdk';
import {
  buildSep10Challenge,
  getSep10HomeDomain,
  getSep10WebAuthDomain,
  getServerNetworkPassphrase,
} from '@/lib/sep10-server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Route Handlers run server-only and are never shipped to the client bundle
// — this is where the SEP-10 server signing key is used.
export const runtime = 'nodejs';

/**
 * POST /api/auth/sep10/challenge
 * Body: `{ account: string }` — a Stellar public key (G...).
 * Returns: `{ transaction: string, networkPassphrase: string }` — a SEP-10
 * challenge transaction, signed by the server, for the caller to counter-sign
 * with their wallet.
 */
export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`sep10-challenge:${clientIp}`, {
    limit: RATE_LIMIT,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    console.warn(`SEP-10 challenge rate limit exceeded for IP ${clientIp}`);
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

  const account = (body as { account?: unknown } | null)?.account;
  if (typeof account !== 'string' || !StrKey.isValidEd25519PublicKey(account)) {
    return NextResponse.json(
      { error: 'A valid Stellar account (G...) is required.' },
      { status: 400 },
    );
  }

  const serverSecret = process.env.SEP10_SERVER_SIGNING_SECRET;
  if (!serverSecret) {
    // Never leak *why* to the client beyond "not configured" — the secret
    // itself and any stack trace stay server-side only.
    console.error('SEP-10 challenge requested but SEP10_SERVER_SIGNING_SECRET is unset.');
    return NextResponse.json(
      { error: 'Wallet sign-in is not configured on this server.' },
      { status: 500 },
    );
  }

  try {
    const challenge = buildSep10Challenge({
      serverSecret,
      clientAccountId: account,
      homeDomain: getSep10HomeDomain(),
      webAuthDomain: getSep10WebAuthDomain(),
      networkPassphrase: getServerNetworkPassphrase(),
    });
    return NextResponse.json(challenge);
  } catch (err) {
    console.error('Failed to build SEP-10 challenge:', err);
    return NextResponse.json(
      { error: 'Could not build an authentication challenge.' },
      { status: 500 },
    );
  }
}
