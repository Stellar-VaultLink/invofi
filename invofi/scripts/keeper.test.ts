process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  parseRawEvent,
  statusNum,
  parseKeeperMode,
  parseStartLedger,
  STATUS,
  processEvents,
} from './keeper.js';
import { nativeToScVal } from '@stellar/stellar-sdk';

describe('Keeper Unit Tests', () => {
  test('statusNum parses status variants correctly', () => {
    assert.equal(statusNum('Pending'), STATUS.Pending);
    assert.equal(statusNum('Financed'), STATUS.Financed);
    assert.equal(statusNum(1), STATUS.Financed);
    assert.equal(statusNum('3'), STATUS.Overdue);
    assert.equal(statusNum('InvalidStatus'), -1);
  });

  test('parseRawEvent correctly decodes inv_reg event', () => {
    const topic0 = nativeToScVal('inv_reg', { type: 'symbol' });
    const topic1 = nativeToScVal('INV-101', { type: 'symbol' });
    const value = nativeToScVal(['GABC...', 5000n, 1700000000n]);

    const rawEvent = {
      type: 'contract',
      contractId: 'CCREGISTRY...',
      topic: [topic0, topic1],
      value,
      ledger: 12345,
      ledgerClosedAt: '2026-08-18T10:00:00Z',
      id: 'evt-1',
      pagingToken: 'pt-1',
      inSuccessfulContractCall: true,
      txHash: 'hash-1',
    } as any;

    const parsed = parseRawEvent(rawEvent);
    assert.notEqual(parsed, null);
    assert.equal(parsed?.type, 'inv_reg');
    assert.equal(parsed?.invoiceId, 'INV-101');
    assert.equal(parsed?.ledger, 12345);
  });

  test('parseRawEvent correctly decodes off_acc event', () => {
    const topic0 = nativeToScVal('off_acc', { type: 'symbol' });
    const topic1 = nativeToScVal('INV-303', { type: 'symbol' });
    const value = nativeToScVal(['INV-303', 'GLENDER...', 10000n]);

    const rawEvent = {
      type: 'contract',
      contractId: 'CCFINANCING...',
      topic: [topic0, topic1],
      value,
      ledger: 12346,
      ledgerClosedAt: '2026-08-18T10:00:05Z',
      id: 'evt-2',
      pagingToken: 'pt-2',
      inSuccessfulContractCall: true,
      txHash: 'hash-2',
    } as any;

    const parsed = parseRawEvent(rawEvent);
    assert.notEqual(parsed, null);
    assert.equal(parsed?.type, 'off_acc');
    assert.equal(parsed?.invoiceId, 'INV-303');
    assert.equal(parsed?.ledger, 12346);
  });

  test('parseRawEvent returns null on decoder failure paths', () => {
    const validTopic0 = nativeToScVal('inv_reg', { type: 'symbol' });
    const validTopic1 = nativeToScVal('INV-100', { type: 'symbol' });
    const validValue = nativeToScVal(['GABC...', 5000n]);

    // 1. Unrecognized event name
    const unrecTopic0 = nativeToScVal('unknown_event', { type: 'symbol' });
    assert.equal(
      parseRawEvent({ topic: [unrecTopic0, validTopic1], value: validValue } as any),
      null,
    );

    // 2. Missing topic 1
    assert.equal(
      parseRawEvent({ topic: [validTopic0], value: validValue } as any),
      null,
    );

    // 3. Non-string topic 1 (e.g. u32 ScVal)
    const intTopic1 = nativeToScVal(9999, { type: 'u32' });
    assert.equal(
      parseRawEvent({ topic: [validTopic0, intTopic1], value: validValue } as any),
      null,
    );

    // 4. Undecodable value
    const badValue = { _switch: { value: -9999 } } as any;
    assert.equal(
      parseRawEvent({ topic: [validTopic0, validTopic1], value: badValue } as any),
      null,
    );
  });

  test('processEvents with empty event list preserves counter contract', async () => {
    const dummyKp = { publicKey: () => 'GBDUMMY...' } as any;
    const result = await processEvents([], dummyKp);
    assert.deepEqual(result, { processed: 0, ttlBumps: 0, markedOverdue: 0 });
  });

  test('parseKeeperMode handles CLI flags, env vars, and default fallbacks', () => {
    const originalArgv = process.argv;
    const originalEnvMode = process.env.KEEPER_MODE;

    try {
      // Clear inputs -> default fallback 'sweep'
      process.argv = ['node', 'keeper.js'];
      delete process.env.KEEPER_MODE;
      assert.equal(parseKeeperMode(), 'sweep');

      // ENV var fallback
      process.env.KEEPER_MODE = 'event-driven';
      assert.equal(parseKeeperMode(), 'event-driven');

      // CLI flag overrides ENV var
      process.argv = ['node', 'keeper.js', '--mode=event-catchup'];
      assert.equal(parseKeeperMode(), 'event-catchup');
    } finally {
      process.argv = originalArgv;
      if (originalEnvMode !== undefined) {
        process.env.KEEPER_MODE = originalEnvMode;
      } else {
        delete process.env.KEEPER_MODE;
      }
    }
  });

  test('parseStartLedger handles CLI flags, env vars, and default fallbacks', () => {
    const originalArgv = process.argv;
    const originalEnvStart = process.env.KEEPER_START_LEDGER;

    try {
      process.argv = ['node', 'keeper.js'];
      delete process.env.KEEPER_START_LEDGER;
      assert.equal(parseStartLedger(), undefined);

      process.env.KEEPER_START_LEDGER = '50000';
      assert.equal(parseStartLedger(), 50000);

      process.argv = ['node', 'keeper.js', '--start-ledger=60000'];
      assert.equal(parseStartLedger(), 60000);
    } finally {
      process.argv = originalArgv;
      if (originalEnvStart !== undefined) {
        process.env.KEEPER_START_LEDGER = originalEnvStart;
      } else {
        delete process.env.KEEPER_START_LEDGER;
      }
    }
  });
});
