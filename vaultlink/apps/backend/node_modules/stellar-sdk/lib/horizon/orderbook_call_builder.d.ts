import { Asset } from "@stellar/stellar-base";
import { CallBuilder } from "./call_builder";
import { ServerApi } from "./server_api";
/**
 * Creates a new {@link OrderbookCallBuilder} pointed to server defined by serverUrl.
 *
 * Do not create this object directly, use {@link Server#orderbook}.
 * @see [Orderbook Details](https://developers.stellar.org/api/aggregations/order-books/)
 * @param {string} serverUrl serverUrl Horizon server URL.
 * @param {Asset} selling Asset being sold
 * @param {Asset} buying Asset being bought
 */
export declare class OrderbookCallBuilder extends CallBuilder<ServerApi.OrderbookRecord> {
    constructor(serverUrl: URI, selling: Asset, buying: Asset);
}
