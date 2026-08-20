'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { listenToEvents, type ProtocolEvent, type ProtocolEventName, type StopListening } from '@invofi/sdk';
import {
  RPC_URL,
  NETWORK_PASSPHRASE,
  REGISTRY_CONTRACT_ID,
  FINANCING_CONTRACT_ID,
  REPAYMENT_CONTRACT_ID,
} from '@/lib/constants';

/** Connection status of the event subscription. */
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/** Stable empty array to avoid unnecessary re-renders. */
const EMPTY_EVENT_TYPES: ProtocolEventName[] = [];

/** Subset of invoice-relevant event types that trigger UI updates. */
const INVOICE_EVENT_TYPES = [
  'inv_reg',
  'inv_sts',
  'inv_amt',
  'inv_cxl',
  'inv_ovd',
  'inv_def',
  'inv_dsp',
  'inv_rsl',
  'inv_rep',
  'off_acc',
  'off_def',
] as const;

interface UseEventSubscriptionOptions {
  /** If false, subscription is paused. Defaults to true. */
  enabled?: boolean;
  /** Additional event types beyond the invoice defaults. */
  additionalEventTypes?: ProtocolEventName[];
}

interface UseEventSubscriptionReturn {
  /** Current connection status. */
  status: ConnectionStatus;
  /** Number of events received since subscription started. */
  eventCount: number;
  /** Most recent event, if any. */
  lastEvent: ProtocolEvent | null;
}

/**
 * Subscribes to Soroban contract events in real-time and invalidates
 * React Query caches when invoice-relevant events arrive.
 *
 * Falls back to standard polling (react-query refetchInterval) when
 * the event source is unavailable.
 */
export function useEventSubscription(
  options: UseEventSubscriptionOptions = {},
): UseEventSubscriptionReturn {
  const { enabled = true, additionalEventTypes = EMPTY_EVENT_TYPES } = options;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [eventCount, setEventCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<ProtocolEvent | null>(null);
  const stopRef = useRef<StopListening | null>(null);
  const mountedRef = useRef(true);
  const seenRef = useRef<Set<string>>(new Set());

  const handleEvent = useCallback(
    (event: ProtocolEvent) => {
      if (!mountedRef.current) return;

      // Deduplicate by txHash + type + subjectId.
      const key = `${event.txHash}:${event.type}:${event.subjectId ?? ''}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      // Bound the set to prevent unbounded growth.
      if (seenRef.current.size > 1_000) {
        const first = seenRef.current.values().next().value;
        if (first !== undefined) seenRef.current.delete(first);
      }

      setEventCount((c) => c + 1);
      setLastEvent(event);

      // Invalidate relevant query caches based on event type.
      switch (event.type) {
        case 'inv_reg':
        case 'inv_sts':
        case 'inv_amt':
        case 'inv_cxl':
        case 'inv_ovd':
        case 'inv_def':
        case 'inv_dsp':
        case 'inv_rsl':
          // Invoice changed — invalidate invoice lists and detail.
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
          if (event.subjectId) {
            queryClient.invalidateQueries({ queryKey: ['invoice', event.subjectId] });
          }
          break;
        case 'off_acc':
        case 'off_def':
          // Offer changed — invalidate offers and the related invoice.
          queryClient.invalidateQueries({ queryKey: ['offers'] });
          if (event.subjectId) {
            queryClient.invalidateQueries({ queryKey: ['invoice', event.subjectId] });
          }
          break;
        case 'inv_rep':
          // Repayment — invalidate offers, invoices, marketplace, and related invoice detail.
          queryClient.invalidateQueries({ queryKey: ['offers'] });
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
          queryClient.invalidateQueries({ queryKey: ['marketplace'] });
          if (event.subjectId) {
            queryClient.invalidateQueries({ queryKey: ['invoice', event.subjectId] });
          }
          break;
        default:
          break;
      }
    },
    [queryClient],
  );

  const handleError = useCallback(
    (_error: Error, context: { attempt: number; nextRetryMs: number }) => {
      if (!mountedRef.current) return;
      if (context.attempt >= 1) {
        setStatus('reconnecting');
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      setStatus('disconnected');
      return;
    }

    mountedRef.current = true;
    setStatus('connecting');

    const contractIds = [
      REGISTRY_CONTRACT_ID,
      FINANCING_CONTRACT_ID,
      REPAYMENT_CONTRACT_ID,
    ].filter(Boolean);

    if (contractIds.length === 0) {
      setStatus('disconnected');
      return;
    }

    const eventTypes: ProtocolEventName[] = [...INVOICE_EVENT_TYPES, ...additionalEventTypes];

    try {
      stopRef.current = listenToEvents({
        rpcUrl: RPC_URL,
        networkPassphrase: NETWORK_PASSPHRASE,
        contractIds,
        eventTypes,
        pollIntervalMs: 5_000,
        maxRetries: 5,
        onEvent: handleEvent,
        onError: handleError,
      });

      // Mark as connected after a short delay (first poll succeeds).
      const connectTimer = setTimeout(() => {
        if (mountedRef.current) setStatus('connected');
      }, 1_000);

      return () => {
        clearTimeout(connectTimer);
        mountedRef.current = false;
        if (stopRef.current) {
          stopRef.current();
          stopRef.current = null;
        }
      };
    } catch {
      setStatus('disconnected');
      return () => {
        mountedRef.current = false;
      };
    }
  }, [enabled, additionalEventTypes, handleEvent, handleError]);

  return { status, eventCount, lastEvent };
}
