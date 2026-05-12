import { CallBuilder } from "./call_builder";
import { ServerApi } from "./server_api";
/**
 * Creates a new {@link OperationCallBuilder} pointed to server defined by serverUrl.
 * Do not create this object directly, use {@link Server#operations}.
 *
 * @see [All Operations](https://developers.stellar.org/api/resources/operations/)
 * @class OperationCallBuilder
 * @class
 * @augments CallBuilder
 * @param {string} serverUrl Horizon server URL.
 */
export declare class OperationCallBuilder extends CallBuilder<ServerApi.CollectionPage<ServerApi.OperationRecord>> {
    constructor(serverUrl: URI);
    /**
     * The operation details endpoint provides information on a single operation. The operation ID provided in the id
     * argument specifies which operation to load.
     * @see [Operation Details](https://developers.stellar.org/api/resources/operations/single/)
     * @param {number} operationId Operation ID
     * @returns {CallBuilder} this OperationCallBuilder instance
     */
    operation(operationId: string): CallBuilder<ServerApi.OperationRecord>;
    /**
     * This endpoint represents all operations that were included in valid transactions that affected a particular account.
     * @see [Operations for Account](https://developers.stellar.org/api/resources/accounts/operations/)
     * @param {string} accountId For example: `GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD`
     * @returns {OperationCallBuilder} this OperationCallBuilder instance
     */
    forAccount(accountId: string): this;
    /**
     * This endpoint represents all operations that reference a given claimable_balance.
     * @see [Operations for Claimable Balance](https://developers.stellar.org/api/resources/claimablebalances/operations/)
     * @param {string} claimableBalanceId Claimable Balance ID
     * @returns {OperationCallBuilder} this OperationCallBuilder instance
     */
    forClaimableBalance(claimableBalanceId: string): this;
    /**
     * This endpoint returns all operations that occurred in a given ledger.
     *
     * @see [Operations for Ledger](https://developers.stellar.org/api/resources/ledgers/operations/)
     * @param {number|string} sequence Ledger sequence
     * @returns {OperationCallBuilder} this OperationCallBuilder instance
     */
    forLedger(sequence: number | string): this;
    /**
     * This endpoint represents all operations that are part of a given transaction.
     * @see [Operations for Transaction](https://developers.stellar.org/api/resources/transactions/operations/)
     * @param {string} transactionId Transaction ID
     * @returns {OperationCallBuilder} this OperationCallBuilder instance
     */
    forTransaction(transactionId: string): this;
    /**
     * This endpoint represents all operations involving a particular liquidity pool.
     *
     * @param {string} poolId   liquidity pool ID
     * @returns {OperationCallBuilder} this OperationCallBuilder instance
     */
    forLiquidityPool(poolId: string): this;
    /**
     * Adds a parameter defining whether to include failed transactions.
     *   By default, only operations of successful transactions are returned.
     *
     * @param {boolean} value Set to `true` to include operations of failed transactions.
     * @returns {OperationCallBuilder} this OperationCallBuilder instance
     */
    includeFailed(value: boolean): this;
}
