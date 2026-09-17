import { type Page } from '@playwright/test';
import { Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';

/**
 * Stubs the LOBSTR browser extension so wallet-gated UI behind a LOBSTR
 * connection is reachable in tests — the second approved extension wallet
 * (ADR-0001 allowlist), complementing `mockFreighter` in ./fixtures.
 *
 * `@lobstrco/signer-extension-api` talks to the extension's content script
 * over `window.postMessage`: it posts
 * `{ source: 'LOBSTR_EXTERNAL_MSG_REQUEST', messageId, type, version }` and
 * resolves on a reply whose `source` is `LOBSTR_EXTERNAL_MSG_RESPONSE` and
 * whose `messagedId` (sic — the upstream field name is misspelled, same as
 * freighter-api's) echoes the request id. Message shapes, read off the
 * published bundle (v2.1.0):
 *
 * - `REQUEST_CONNECTION_STATUS` → `{ isConnected }` (2s timeout in the API,
 *   resolving `{ isConnected: false }` when the extension doesn't answer)
 * - `REQUEST_ACCESS` → `{ publicKey, connectionKey, error }` (error truthy
 *   throws; the connection key is cached in sessionStorage under
 *   `LOBSTR_CONNECTION_KEY`)
 * - `SIGN` → `{ signedData, error, signerAddress }` (error truthy throws)
 *
 * The API also short-circuits `isConnected()` when
 * `window.lobstrSignerExtension` is present, so the init script sets it.
 */
export async function mockLobstr(
  page: Page,
  address: string,
  /** Secret key signing SIGN (transaction) requests. Random throwaway when omitted. */
  signerSecret?: string,
): Promise<void> {
  const secret = signerSecret ?? Keypair.random().secret();

  // Node-side signer: the page hands the XDR to this binding, the test
  // process holds the fixture keypair and the SDK, so signing uses the real
  // Transaction API — same pattern as mockFreighter's __e2eSignTransaction.
  await page.exposeFunction('__e2eLobstrSign', async (txXdr: string) => {
    const kp = Keypair.fromSecret(secret);
    const tx = TransactionBuilder.fromXDR(txXdr, 'Test SDF Network ; September 2015');
    if (!(tx instanceof Transaction)) throw new Error('fee-bump transactions are not supported by the e2e LOBSTR signer');
    tx.sign(kp);
    return tx.toXDR();
  });

  await page.addInitScript(
    ({ addr }: { addr: string }) => {
      // isConnected() fast path: the API returns true without messaging when
      // window.lobstrSignerExtension exists.
      (window as unknown as { lobstrSignerExtension: object }).lobstrSignerExtension = {};

      window.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as { source?: string; messageId?: number; type?: string } | null;
        if (event.source !== window) return;
        if (!data || data.source !== 'LOBSTR_EXTERNAL_MSG_REQUEST') return;

        const reply = (payload: Record<string, unknown>) =>
          window.postMessage(
            {
              source: 'LOBSTR_EXTERNAL_MSG_RESPONSE',
              messagedId: data.messageId, // sic — upstream misspelling
              ...payload,
            },
            window.location.origin,
          );

        switch (data.type) {
          case 'REQUEST_CONNECTION_STATUS':
            return reply({ isConnected: true });
          case 'REQUEST_ACCESS':
            return reply({ publicKey: addr, connectionKey: 'e2e-connection-key', error: '' });
          case 'SIGN': {
            const payload = data as { dataToSign?: string };
            if (!payload.dataToSign) {
              return reply({ signedData: '', signerAddress: addr, error: 'e2e mock: no dataToSign' });
            }
            (window as unknown as { __e2eLobstrSign: (tx: string) => Promise<string> }).__e2eLobstrSign(
              payload.dataToSign,
            ).then(
              (signed: string) => reply({ signedData: signed, signerAddress: addr, error: '' }),
              (e: unknown) =>
                reply({ signedData: '', signerAddress: addr, error: `e2e mock sign failed: ${e}` }),
            );
            return;
          }
          default:
            return;
        }
      });
    },
    { addr: address },
  );
}
