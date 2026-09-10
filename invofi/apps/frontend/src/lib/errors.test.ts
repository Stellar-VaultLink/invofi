import { describe, it, expect } from 'vitest';
import { ContractError, ContractErrorType, SdkError } from '@invofi/sdk';
import { toErrorMessage } from './errors';

describe('toErrorMessage', () => {
  // ── ContractError (already mapped by SDK) ────────────────────────────────────

  it('passes through ContractError.message', () => {
    const err = new ContractError(2, ContractErrorType.NOT_FOUND, 'No resource was found with the given ID.');
    expect(toErrorMessage(err)).toBe('No resource was found with the given ID.');
  });

  it('passes through ContractError with recovery message', () => {
    const err = new ContractError(5, ContractErrorType.INSUFFICIENT_BALANCE, 'The account does not have sufficient balance.', {
      message: 'Add funds to your wallet and try again.',
    });
    expect(toErrorMessage(err)).toBe('The account does not have sufficient balance.');
  });

  // ── SdkError (base class, non-contract) ──────────────────────────────────────

  it('passes through SdkError.message', () => {
    const err = new SdkError('A network error occurred while processing the request.');
    expect(toErrorMessage(err)).toBe('A network error occurred while processing the request.');
  });

  // ── Contract panic string patterns ───────────────────────────────────────────

  it('maps "invoice not found" to a friendly message', () => {
    expect(toErrorMessage(new Error('invoice not found'))).toBe(
      'The invoice was not found. Double-check the invoice ID and try again.',
    );
  });

  it('maps "invoice does not exist" to a friendly message', () => {
    expect(toErrorMessage(new Error('Invoice does not exist'))).toBe(
      'The invoice was not found. Double-check the invoice ID and try again.',
    );
  });

  it('maps "offer already accepted" to a friendly message', () => {
    expect(toErrorMessage(new Error('Offer already accepted'))).toBe(
      'This offer has already been accepted. Refresh the page to see the latest status.',
    );
  });

  it('maps "insufficient balance" to a friendly message', () => {
    expect(toErrorMessage(new Error('Insufficient balance'))).toBe(
      'Your wallet does not have enough funds for this transaction. Add funds and try again.',
    );
  });

  it('maps "contract paused" to a friendly message', () => {
    expect(toErrorMessage('Contract paused')).toBe(
      'The protocol is currently paused. Try again later, or check announcements for updates.',
    );
  });

  it('maps "HostError" to a friendly message', () => {
    expect(toErrorMessage(new Error('HostError: Error(Contract, #4)'))).toBe(
      'The network rejected the transaction. Try again, or contact support if the issue persists.',
    );
  });

  it('maps "Couldn\'t reach network" to a friendly message', () => {
    expect(toErrorMessage(new Error("Couldn't reach network"))).toBe(
      'Could not reach the network. Check your internet connection and try again.',
    );
  });

  it('maps "network timeout" to a friendly message', () => {
    expect(toErrorMessage(new Error('network timeout'))).toBe(
      'Could not reach the network. Check your internet connection and try again.',
    );
  });

  it('maps "connection refused" to a friendly message', () => {
    expect(toErrorMessage(new Error('Connection refused'))).toBe(
      'Connection lost. Check your internet connection and try again.',
    );
  });

  it('maps "user rejected" to a friendly message', () => {
    expect(toErrorMessage(new Error('User rejected the request'))).toBe(
      'The transaction was cancelled in your wallet.',
    );
  });

  it('maps "wallet not found" to a friendly message', () => {
    expect(toErrorMessage(new Error('Wallet not found'))).toBe(
      'No wallet is connected. Connect your wallet and try again.',
    );
  });

  // ── Unknown errors ──────────────────────────────────────────────────────────

  it('wraps unknown error messages with a generic prefix', () => {
    expect(toErrorMessage(new Error('Something went terribly wrong'))).toBe(
      'Contract call failed: Something went terribly wrong',
    );
  });

  it('wraps unknown string errors with a generic prefix', () => {
    expect(toErrorMessage('Unknown panic: unexpected #1')).toBe(
      'Contract call failed: Unknown panic: unexpected #1',
    );
  });

  it('uses the fallback for non-stringifiable errors', () => {
    expect(toErrorMessage(undefined)).toBe('An unexpected error occurred. Please try again.');
    expect(toErrorMessage(null)).toBe('An unexpected error occurred. Please try again.');
  });

  it('honours a custom fallback string', () => {
    expect(toErrorMessage(undefined, 'Custom fallback')).toBe('Custom fallback');
  });

  it('handles object errors with a message property', () => {
    expect(toErrorMessage({ message: 'custom error' })).toBe(
      'Contract call failed: custom error',
    );
  });
});