'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  deriveSharedSecret,
  deriveEncryptionKey,
  encryptMessage,
  decryptMessage,
} from '@/lib/encryption';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MessageType = 'text' | 'document_ref' | 'term_proposal';

/** A message row after decryption — safe to pass to the UI. */
export interface DecryptedMessage {
  id: string;
  sender_address: string;
  /** Decrypted plaintext, or '[Encrypted message]' if decryption fails. */
  content: string;
  message_type: MessageType;
  read_at: string | null;
  created_at: string;
}

/** Raw row from the `encrypted_messages` Supabase table. */
interface EncryptedMessageRow {
  id: string;
  invoice_id: string;
  sender_address: string;
  recipient_address: string;
  encrypted_content: string;
  message_type: MessageType;
  read_at: string | null;
  retention_days: number;
  created_at: string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000;

/**
 * useMessages — fetch, decrypt, send and mark-as-read encrypted invoice
 * messages between two Stellar wallet addresses.
 *
 * @param invoiceId          Invoice the conversation is attached to.
 * @param currentAddress     Connected wallet address (the local user).
 * @param counterpartyAddress The other party's wallet address.
 */
export function useMessages(
  invoiceId: string,
  currentAddress: string,
  counterpartyAddress: string,
) {
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cache the derived key across re-renders so we don't re-run PBKDF2 on every
  // poll cycle (100k iterations is intentionally slow).
  const keyRef = useRef<CryptoKey | null>(null);
  const keyInitialisedRef = useRef(false);

  // Ensure both addresses are present before doing anything.
  const ready = Boolean(invoiceId && currentAddress && counterpartyAddress);

  // ── Key derivation (once per address pair) ─────────────────────────────────

  useEffect(() => {
    if (!ready) return;
    keyInitialisedRef.current = false;
    keyRef.current = null;

    const sharedSecret = deriveSharedSecret(currentAddress, counterpartyAddress);
    deriveEncryptionKey(sharedSecret)
      .then(k => {
        keyRef.current = k;
        keyInitialisedRef.current = true;
      })
      .catch(err => {
        console.error('[useMessages] Key derivation failed:', err);
        setError('Failed to initialise encryption key.');
      });
  }, [currentAddress, counterpartyAddress, ready]);

  // ── Fetch + decrypt ────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    if (!ready || !keyRef.current) return;

    try {
      const { data, error: dbError } = await supabase
        .from('encrypted_messages')
        .select('*')
        .eq('invoice_id', invoiceId)
        .or(
          `sender_address.eq.${currentAddress},recipient_address.eq.${currentAddress}`,
        )
        .order('created_at', { ascending: true });

      if (dbError) {
        setError(dbError.message);
        return;
      }

      const rows = (data as EncryptedMessageRow[]) ?? [];
      const key = keyRef.current;

      const decrypted = await Promise.all(
        rows.map(async (row): Promise<DecryptedMessage> => {
          let content: string;
          try {
            content = await decryptMessage(key, row.encrypted_content);
          } catch {
            // Decryption failure — message from a different key epoch or
            // corrupted data.  Show a safe placeholder.
            content = '[Encrypted message]';
          }
          return {
            id: row.id,
            sender_address: row.sender_address,
            content,
            message_type: row.message_type,
            read_at: row.read_at,
            created_at: row.created_at,
          };
        }),
      );

      setMessages(decrypted);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages.');
    } finally {
      setLoading(false);
    }
  }, [invoiceId, currentAddress, ready]);

  // Initial load — wait until key is ready.
  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }

    // Poll until the key is derived (normally < 1 s).
    const waitForKey = setInterval(() => {
      if (keyInitialisedRef.current) {
        clearInterval(waitForKey);
        fetchMessages();
      }
    }, 100);

    return () => clearInterval(waitForKey);
  }, [ready, fetchMessages]);

  // Polling every 5 s.
  useEffect(() => {
    if (!ready) return;

    const interval = setInterval(() => {
      if (keyInitialisedRef.current) {
        fetchMessages();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [ready, fetchMessages]);

  // ── sendMessage ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string, type: MessageType = 'text') => {
      if (!ready) throw new Error('Addresses not ready.');
      if (!keyRef.current) throw new Error('Encryption key not ready.');

      const encrypted = await encryptMessage(keyRef.current, content);

      const { error: insertError } = await supabase
        .from('encrypted_messages')
        .insert({
          invoice_id: invoiceId,
          sender_address: currentAddress,
          recipient_address: counterpartyAddress,
          encrypted_content: encrypted,
          message_type: type,
        });

      if (insertError) throw new Error(insertError.message);

      // Optimistically append to the local list.
      const optimistic: DecryptedMessage = {
        id: crypto.randomUUID(),
        sender_address: currentAddress,
        content,
        message_type: type,
        read_at: null,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, optimistic]);
    },
    [invoiceId, currentAddress, counterpartyAddress, ready],
  );

  // ── markAsRead ─────────────────────────────────────────────────────────────

  const markAsRead = useCallback(
    async (messageId: string) => {
      const readAt = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('encrypted_messages')
        .update({ read_at: readAt })
        .eq('id', messageId)
        .eq('recipient_address', currentAddress); // RLS guard mirrored in query

      if (updateError) {
        console.warn('[useMessages] markAsRead failed:', updateError.message);
        return;
      }

      setMessages(prev =>
        prev.map(m => (m.id === messageId ? { ...m, read_at: readAt } : m)),
      );
    },
    [currentAddress],
  );

  return { messages, sendMessage, loading, error, markAsRead };
}
