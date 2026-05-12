import { Api } from './api';
export declare function parseRawSendTransaction(r: Api.RawSendTransactionResponse): Api.SendTransactionResponse;
export declare function parseTransactionInfo(raw: Api.RawTransactionInfo | Api.RawGetTransactionResponse): Omit<Api.TransactionInfo, 'status'>;
export declare function parseRawTransactions(r: Api.RawTransactionInfo): Api.TransactionInfo;
export declare function parseRawEvents(r: Api.RawGetEventsResponse): Api.GetEventsResponse;
export declare function parseRawLedgerEntries(raw: Api.RawGetLedgerEntriesResponse): Api.GetLedgerEntriesResponse;
/**
 * Converts a raw response schema into one with parsed XDR fields and a
 * simplified interface.
 * Warning: This API is only exported for testing purposes and should not be
 *          relied on or considered "stable".
 *
 * @param {Api.SimulateTransactionResponse|Api.RawSimulateTransactionResponse} sim the raw response schema (parsed ones are allowed, best-effort
 *    detected, and returned untouched)
 *
 * @returns the original parameter (if already parsed), parsed otherwise
 *
 */
export declare function parseRawSimulation(sim: Api.SimulateTransactionResponse | Api.RawSimulateTransactionResponse): Api.SimulateTransactionResponse;
