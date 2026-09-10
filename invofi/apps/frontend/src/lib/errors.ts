// ── Human-readable error mapping for contract-call failures (#139) ────────────
//
// When a contract call fails, the raw error message ("HostError",
// "Couldn't reach network", or a numeric code like "Error(Contract, #2)")
// is opaque to users. This module maps known panic strings and SDK errors
// to friendly, actionable toast text.
//
// Usage:
//   import { toErrorMessage } from '@/lib/errors';
//   try { ... } catch (err) {
//     toast({ title: 'Failed to submit offer', description: toErrorMessage(err), variant: 'destructive' });
//   }
//
// Acceptance:
// - Each known panic string maps to a clear user message.
// - Unknown errors still show the original message with a generic prefix.

import { SdkError, ContractError } from '@invofi/sdk';

// ── Known panic-string patterns ───────────────────────────────────────────────
// Maps raw Soroban panic strings / host error patterns to friendly messages.
// Order matters: first match wins.

interface PanicEntry {
  /** RegExp that matches the raw error message (case-insensitive). */
  pattern: RegExp;
  /** User-facing description for the toast. */
  message: string;
}

const KNOWN_PANICS: PanicEntry[] = [
  // ── Contract-level panics ──────────────────────────────────────────────────
  { pattern: /invoice\s+(not found|does not exist|not_exist)/i,  message: 'The invoice was not found. Double-check the invoice ID and try again.' },
  { pattern: /offer\s+(already accepted|already_accepted)/i,     message: 'This offer has already been accepted. Refresh the page to see the latest status.' },
  { pattern: /insufficient\s+balance/i,                          message: 'Your wallet does not have enough funds for this transaction. Add funds and try again.' },
  { pattern: /contract\s+paused/i,                               message: 'The protocol is currently paused. Try again later, or check announcements for updates.' },
  { pattern: /already\s+exists/i,                                message: 'A resource with this ID already exists. Use a different ID or check the existing entry.' },
  { pattern: /not authorized|unauthorized/i,                     message: 'You are not authorized to perform this action. Sign in with the correct wallet address.' },
  { pattern: /invalid\s+transition/i,                            message: 'This action is not valid for the resource in its current state. Refresh and try again.' },
  { pattern: /invalid\s+input/i,                                 message: 'One or more input values are invalid. Check your entries and try again.' },
  { pattern: /blacklisted/i,                                     message: 'This address has been blacklisted. Contact support if you believe this is a mistake.' },

  // ── Network-level errors ───────────────────────────────────────────────────
  { pattern: /couldn't\s+reach\s+network|network\s+(error|unreachable|timeout)/i, message: 'Could not reach the network. Check your internet connection and try again.' },
  { pattern: /hosterror/i,                                       message: 'The network rejected the transaction. Try again, or contact support if the issue persists.' },
  { pattern: /connection\s+(refused|reset|closed|timed?\s*out)/i, message: 'Connection lost. Check your internet connection and try again.' },
  { pattern: /fetch\s+failed/i,                                  message: 'Unable to contact the server. Check your connection and try again.' },
  { pattern: /rate\s+limit/i,                                    message: 'Too many requests. Please wait a moment and try again.' },
  { pattern: /timeout/i,                                         message: 'The request timed out. Check your connection and try again.' },
  { pattern: /wallet\s+not\s+(found|connected|available)/i,      message: 'No wallet is connected. Connect your wallet and try again.' },
  { pattern: /user\s+rejected/i,                                 message: 'The transaction was cancelled in your wallet.' },
];

/**
 * Translates a raw error value into a user-friendly description string.
 *
 * Priority:
 * 1. Already a `ContractError` → use its `.message` (already mapped by SDK).
 * 2. Already a `SdkError` → use its `.message`.
 * 3. Matches a known panic pattern → use the mapped friendly message.
 * 4. Unknown → prepend a generic prefix to the original message.
 *
 * @param err      - The thrown value (Error, string, or unknown).
 * @param fallback - Fallback text when the error cannot be stringified.
 */
export function toErrorMessage(err: unknown, fallback = 'An unexpected error occurred. Please try again.'): string {
  // 1. ContractError (already has friendly message from SDK mapping)
  if (err instanceof ContractError) {
    return err.message;
  }

  // 2. SdkError (base class, non-contract SDK errors)
  if (err instanceof SdkError) {
    return err.message;
  }

  // 3. Extract a string from the raw error
  const rawMessage = extractRawMessage(err);
  if (!rawMessage) return fallback;

  // 4. Check known panic patterns
  for (const entry of KNOWN_PANICS) {
    if (entry.pattern.test(rawMessage)) {
      return entry.message;
    }
  }

  // 5. Unknown — generic prefix so users know it's a contract-call error
  return `Contract call failed: ${rawMessage}`;
}

/**
 * Extracts a string message from an unknown thrown value.
 */
function extractRawMessage(err: unknown): string | null {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    // Some Soroban errors are objects with a `message` property
    if ('message' in err && typeof (err as Record<string, unknown>).message === 'string') {
      return (err as Record<string, string>).message;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return null;
}