import { FeeBumpTransaction, Keypair, Transaction } from "@stellar/stellar-base";
import { ServerApi } from "../horizon/server_api";
/**
 * Returns a valid [SEP-10](https://stellar.org/protocol/sep-10) challenge
 * transaction which you can use for Stellar Web Authentication.
 *
 * @function
 * @memberof WebAuth
 *
 * @param {Keypair} serverKeypair Keypair for server's signing account.
 * @param {string} clientAccountID The stellar account (G...) or muxed account
 *    (M...) that the wallet wishes to authenticate with the server.
 * @param {string} homeDomain The fully qualified domain name of the service
 *    requiring authentication
 * @param {number} [timeout=300] Challenge duration (default to 5 minutes).
 * @param {string} networkPassphrase The network passphrase. If you pass this
 *    argument then timeout is required.
 * @param {string} webAuthDomain The fully qualified domain name of the service
 *    issuing the challenge.
 * @param {string} [memo] The memo to attach to the challenge transaction. The
 *    memo must be of type `id`. If the `clientaccountID` is a muxed account,
 *    memos cannot be used.
 * @param {string} [clientDomain] The fully qualified domain of the client
 *    requesting the challenge. Only necessary when the the 'client_domain'
 *    parameter is passed.
 * @param {string} [clientSigningKey] The public key assigned to the SIGNING_KEY
 *    attribute specified on the stellar.toml hosted on the client domain. Only
 *    necessary when the 'client_domain' parameter is passed.
 *
 * @returns {string} A base64 encoded string of the raw TransactionEnvelope xdr
 *    struct for the transaction.
 * @see [SEP-10: Stellar Web Auth](https://stellar.org/protocol/sep-10).
 *
 * @example
 * import { Keypair, Networks, WebAuth }  from 'stellar-sdk'
 *
 * let serverKeyPair = Keypair.fromSecret("server-secret")
 * let challenge = WebAuth.buildChallengeTx(
 *    serverKeyPair,
 *    "client-stellar-account-id",
 *    "stellar.org",
 *    300,
 *    Networks.TESTNET);
 */
export declare function buildChallengeTx(serverKeypair: Keypair, clientAccountID: string, homeDomain: string, timeout: number | undefined, networkPassphrase: string, webAuthDomain: string, memo?: string | null, clientDomain?: string | null, clientSigningKey?: string | null): string;
/**
 * Reads a SEP 10 challenge transaction and returns the decoded transaction and
 * client account ID contained within.
 *
 * It also verifies that the transaction has been signed by the server.
 *
 * It does not verify that the transaction has been signed by the client or that
 * any signatures other than the server's on the transaction are valid. Use one
 * of the following functions to completely verify the transaction:
 * - {@link verifyChallengeTxThreshold}
 * - {@link verifyChallengeTxSigners}
 *
 * @function
 * @memberof WebAuth
 *
 * @param {string} challengeTx SEP0010 challenge transaction in base64.
 * @param {string} serverAccountID The server's stellar account (public key).
 * @param {string} networkPassphrase The network passphrase, e.g.: 'Test SDF
 *    Network ; September 2015' (see {@link Networks})
 * @param {string|string[]} [homeDomains] The home domain that is expected to be
 *    included in the first Manage Data operation's string key. If an array is
 *    provided, one of the domain names in the array must match.
 * @param {string} webAuthDomain The home domain that is expected to be included
 *    as the value of the Manage Data operation with the 'web_auth_domain' key.
 *    If no such operation is included, this parameter is not used.
 *
 * @returns {Transaction|string|string|string} The actual transaction and the
 *    stellar public key (master key) used to sign the Manage Data operation,
 *    the matched home domain, and the memo attached to the transaction, which
 *    will be null if not present.
 *
 * @see [SEP-10: Stellar Web Auth](https://stellar.org/protocol/sep-10).
 */
export declare function readChallengeTx(challengeTx: string, serverAccountID: string, networkPassphrase: string, homeDomains: string | string[], webAuthDomain: string): {
    tx: Transaction;
    clientAccountID: string;
    matchedHomeDomain: string;
    memo: string | null;
};
/**
 * Verifies that for a SEP-10 challenge transaction all signatures on the
 * transaction are accounted for and that the signatures meet a threshold on an
 * account. A transaction is verified if it is signed by the server account, and
 * all other signatures match a signer that has been provided as an argument,
 * and those signatures meet a threshold on the account.
 *
 * Signers that are not prefixed as an address/account ID strkey (G...) will be
 * ignored.
 *
 * Errors will be raised if:
 *  - The transaction is invalid according to {@link readChallengeTx}.
 *  - No client signatures are found on the transaction.
 *  - One or more signatures in the transaction are not identifiable as the
 *    server account or one of the signers provided in the arguments.
 *  - The signatures are all valid but do not meet the threshold.
 *
 * @function
 * @memberof WebAuth
 *
 * @param {string} challengeTx SEP0010 challenge transaction in base64.
 * @param {string} serverAccountID The server's stellar account (public key).
 * @param {string} networkPassphrase The network passphrase, e.g.: 'Test SDF
 *    Network ; September 2015' (see {@link Networks}).
 * @param {number} threshold The required signatures threshold for verifying
 *    this transaction.
 * @param {ServerApi.AccountRecordSigners[]} signerSummary a map of all
 *    authorized signers to their weights. It's used to validate if the
 *    transaction signatures have met the given threshold.
 * @param {string|string[]} [homeDomains] The home domain(s) that should be
 *    included in the first Manage Data operation's string key. Required in
 *    verifyChallengeTxSigners() => readChallengeTx().
 * @param {string} webAuthDomain The home domain that is expected to be included
 *    as the value of the Manage Data operation with the 'web_auth_domain' key,
 *    if present. Used in verifyChallengeTxSigners() => readChallengeTx().
 *
 * @returns {string[]} The list of signers public keys that have signed the
 *    transaction, excluding the server account ID, given that the threshold was
 *    met.
 *
 * @see [SEP-10: Stellar Web Auth](https://stellar.org/protocol/sep-10).
 * @example
 * import { Networks, TransactionBuilder, WebAuth }  from 'stellar-sdk';
 *
 * const serverKP = Keypair.random();
 * const clientKP1 = Keypair.random();
 * const clientKP2 = Keypair.random();
 *
 * // Challenge, possibly built in the server side
 * const challenge = WebAuth.buildChallengeTx(
 *   serverKP,
 *   clientKP1.publicKey(),
 *   "SDF",
 *   300,
 *   Networks.TESTNET
 * );
 *
 * // clock.tick(200);  // Simulates a 200 ms delay when communicating from server to client
 *
 * // Transaction gathered from a challenge, possibly from the client side
 * const transaction = TransactionBuilder.fromXDR(challenge, Networks.TESTNET);
 * transaction.sign(clientKP1, clientKP2);
 * const signedChallenge = transaction
 *         .toEnvelope()
 *         .toXDR("base64")
 *         .toString();
 *
 * // Defining the threshold and signerSummary
 * const threshold = 3;
 * const signerSummary = [
 *    {
 *      key: this.clientKP1.publicKey(),
 *      weight: 1,
 *    },
 *    {
 *      key: this.clientKP2.publicKey(),
 *      weight: 2,
 *    },
 *  ];
 *
 * // The result below should be equal to [clientKP1.publicKey(), clientKP2.publicKey()]
 * WebAuth.verifyChallengeTxThreshold(
 *    signedChallenge,
 *    serverKP.publicKey(),
 *    Networks.TESTNET,
 *    threshold,
 *    signerSummary
 * );
 */
export declare function verifyChallengeTxThreshold(challengeTx: string, serverAccountID: string, networkPassphrase: string, threshold: number, signerSummary: ServerApi.AccountRecordSigners[], homeDomains: string | string[], webAuthDomain: string): string[];
/**
 * Verifies that for a SEP 10 challenge transaction all signatures on the
 * transaction are accounted for. A transaction is verified if it is signed by
 * the server account, and all other signatures match a signer that has been
 * provided as an argument (as the accountIDs list). Additional signers can be
 * provided that do not have a signature, but all signatures must be matched to
 * a signer (accountIDs) for verification to succeed. If verification succeeds,
 * a list of signers that were found is returned, not including the server
 * account ID.
 *
 * Signers that are not prefixed as an address/account ID strkey (G...) will be
 * ignored.
 *
 * Errors will be raised if:
 *  - The transaction is invalid according to {@link readChallengeTx}.
 *  - No client signatures are found on the transaction.
 *  - One or more signatures in the transaction are not identifiable as the
 *    server account or one of the signers provided in the arguments.
 *
 * @function
 * @memberof WebAuth
 *
 * @param {string} challengeTx SEP0010 challenge transaction in base64.
 * @param {string} serverAccountID The server's stellar account (public key).
 * @param {string} networkPassphrase The network passphrase, e.g.: 'Test SDF
 *    Network ; September 2015' (see {@link Networks}).
 * @param {string[]} signers The signers public keys. This list should contain
 *    the public keys for all signers that have signed the transaction.
 * @param {string|string[]} [homeDomains] The home domain(s) that should be
 *    included in the first Manage Data operation's string key. Required in
 *    readChallengeTx().
 * @param {string} webAuthDomain The home domain that is expected to be included
 *    as the value of the Manage Data operation with the 'web_auth_domain' key,
 *    if present. Used in readChallengeTx().
 * @returns {string[]} The list of signers public keys that have signed the
 *    transaction, excluding the server account ID.
 *
 * @see [SEP-10: Stellar Web Auth](https://stellar.org/protocol/sep-10).
 * @example
 * import { Networks, TransactionBuilder, WebAuth }  from 'stellar-sdk';
 *
 * const serverKP = Keypair.random();
 * const clientKP1 = Keypair.random();
 * const clientKP2 = Keypair.random();
 *
 * // Challenge, possibly built in the server side
 * const challenge = WebAuth.buildChallengeTx(
 *   serverKP,
 *   clientKP1.publicKey(),
 *   "SDF",
 *   300,
 *   Networks.TESTNET
 * );
 *
 * // clock.tick(200);  // Simulates a 200 ms delay when communicating from server to client
 *
 * // Transaction gathered from a challenge, possibly from the client side
 * const transaction = TransactionBuilder.fromXDR(challenge, Networks.TESTNET);
 * transaction.sign(clientKP1, clientKP2);
 * const signedChallenge = transaction
 *         .toEnvelope()
 *         .toXDR("base64")
 *         .toString();
 *
 * // The result below should be equal to [clientKP1.publicKey(), clientKP2.publicKey()]
 * WebAuth.verifyChallengeTxSigners(
 *    signedChallenge,
 *    serverKP.publicKey(),
 *    Networks.TESTNET,
 *    threshold,
 *    [clientKP1.publicKey(), clientKP2.publicKey()]
 * );
 */
export declare function verifyChallengeTxSigners(challengeTx: string, serverAccountID: string, networkPassphrase: string, signers: string[], homeDomains: string | string[], webAuthDomain: string): string[];
/**
 * Verifies if a transaction was signed by the given account id.
 *
 * @function
 * @memberof WebAuth
 * @param {Transaction} transaction
 * @param {string} accountID
 * @returns {boolean}.
 *
 * @example
 * let keypair = Keypair.random();
 * const account = new StellarSdk.Account(keypair.publicKey(), "-1");
 *
 * const transaction = new TransactionBuilder(account, { fee: 100 })
 *    .setTimeout(30)
 *    .build();
 *
 * transaction.sign(keypair)
 * WebAuth.verifyTxSignedBy(transaction, keypair.publicKey())
 */
export declare function verifyTxSignedBy(transaction: FeeBumpTransaction | Transaction, accountID: string): boolean;
/**
 * Checks if a transaction has been signed by one or more of the given signers,
 * returning a list of non-repeated signers that were found to have signed the
 * given transaction.
 *
 * @function
 * @memberof WebAuth
 * @param {Transaction} transaction the signed transaction.
 * @param {string[]} signers The signers public keys.
 * @returns {string[]} a list of signers that were found to have signed the
 * transaction.
 *
 * @example
 * let keypair1 = Keypair.random();
 * let keypair2 = Keypair.random();
 * const account = new StellarSdk.Account(keypair1.publicKey(), "-1");
 *
 * const transaction = new TransactionBuilder(account, { fee: 100 })
 *    .setTimeout(30)
 *    .build();
 *
 * transaction.sign(keypair1, keypair2)
 * WebAuth.gatherTxSigners(transaction, [keypair1.publicKey(), keypair2.publicKey()])
 */
export declare function gatherTxSigners(transaction: FeeBumpTransaction | Transaction, signers: string[]): string[];
