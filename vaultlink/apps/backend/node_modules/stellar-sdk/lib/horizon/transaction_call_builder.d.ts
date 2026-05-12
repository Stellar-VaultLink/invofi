import { CallBuilder } from "./call_builder";
import { ServerApi } from "./server_api";
/**
 * Creates a new {@link TransactionCallBuilder} pointed to server defined by serverUrl.
 * Do not create this object directly, use {@link Server#transactions}.
 *
 * @class TransactionCallBuilder
 * @augments CallBuilder
 * @see [All Transactions](https://developers.stellar.org/api/resources/transactions/)
 * @class
 * @param {string} serverUrl Horizon server URL.
 */
export declare class TransactionCallBuilder extends CallBuilder<ServerApi.CollectionPage<ServerApi.TransactionRecord>> {
    constructor(serverUrl: URI);
    /**
     * The transaction details endpoint provides information on a single transaction. The transaction hash provided in the hash argument specifies which transaction to load.
     * @see [Transaction Details](https://developers.stellar.org/api/resources/transactions/single/)
     * @param {string} transactionId Transaction ID
     * @returns {CallBuilder} a CallBuilder instance
     */
    transaction(transactionId: string): CallBuilder<ServerApi.TransactionRecord>;
    /**
     * This endpoint represents all transactions that affected a given account.
     * @see [Transactions for Account](https://developers.stellar.org/api/resources/accounts/transactions/)
     * @param {string} accountId For example: `GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD`
     * @returns {TransactionCallBuilder} current TransactionCallBuilder instance
     */
    forAccount(accountId: string): this;
    /**
     * This endpoint represents all transactions that reference a given claimable_balance.
     * @see [Operations for Claimable Balance](https://developers.stellar.org/api/resources/claimablebalances/transactions/)
     * @param {string} claimableBalanceId Claimable Balance ID
     * @returns {TransactionCallBuilder} this TransactionCallBuilder instance
     */
    forClaimableBalance(claimableBalanceId: string): this;
    /**
     * This endpoint represents all transactions in a given ledger.
     * @see [Transactions for Ledger](https://developers.stellar.org/api/resources/ledgers/transactions/)
     * @param {number|string} sequence Ledger sequence
     * @returns {TransactionCallBuilder} current TransactionCallBuilder instance
     */
    forLedger(sequence: number | string): this;
    /**
     * This endpoint represents all transactions involving a particular liquidity pool.
     *
     * @param {string} poolId   liquidity pool ID
     * @returns {TransactionCallBuilder} this TransactionCallBuilder instance
     */
    forLiquidityPool(poolId: string): this;
    /**
     * Adds a parameter defining whether to include failed transactions. By default only successful transactions are
     * returned.
     * @param {boolean} value Set to `true` to include failed transactions.
     * @returns {TransactionCallBuilder} current TransactionCallBuilder instance
     */
    includeFailed(value: boolean): this;
}
