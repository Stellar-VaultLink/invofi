import { Asset } from "@stellar/stellar-base";
import { CallBuilder } from "./call_builder";
import { ServerApi } from "./server_api";
/**
 * Creates a new {@link OfferCallBuilder} pointed to server defined by serverUrl.
 * Do not create this object directly, use {@link Server#offers}.
 *
 * @see [Offers](https://developers.stellar.org/api/resources/offers/)
 * @class OfferCallBuilder
 * @class
 * @augments CallBuilder
 * @param {string} serverUrl Horizon server URL.
 */
export declare class OfferCallBuilder extends CallBuilder<ServerApi.CollectionPage<ServerApi.OfferRecord>> {
    constructor(serverUrl: URI);
    /**
     * The offer details endpoint provides information on a single offer. The offer ID provided in the id
     * argument specifies which offer to load.
     * @see [Offer Details](https://developers.stellar.org/api/resources/offers/single/)
     * @param {string} offerId Offer ID
     * @returns {CallBuilder<ServerApi.OfferRecord>} CallBuilder<ServerApi.OfferRecord> OperationCallBuilder instance
     */
    offer(offerId: string): CallBuilder<ServerApi.OfferRecord>;
    /**
     * Returns all offers where the given account is involved.
     *
     * @see [Offers](https://developers.stellar.org/api/resources/accounts/offers/)
     * @param {string} id For example: `GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD`
     * @returns {OfferCallBuilder} current OfferCallBuilder instance
     */
    forAccount(id: string): this;
    /**
     * Returns all offers buying an asset.
     * @see [Offers](https://developers.stellar.org/api/resources/offers/list/)
     * @see Asset
     * @param {Asset} asset For example: `new Asset('USD','GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD')`
     * @returns {OfferCallBuilder} current OfferCallBuilder instance
     */
    buying(asset: Asset): this;
    /**
     * Returns all offers selling an asset.
     * @see [Offers](https://developers.stellar.org/api/resources/offers/list/)
     * @see Asset
     * @param {Asset} asset For example: `new Asset('EUR','GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD')`
     * @returns {OfferCallBuilder} current OfferCallBuilder instance
     */
    selling(asset: Asset): this;
    /**
     * This endpoint filters offers where the given account is sponsoring the offer entry.
     * @see [Offers](https://developers.stellar.org/api/resources/offers/list/)
     * @param {string} id For example: `GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD`
     * @returns {OfferCallBuilder} current OfferCallBuilder instance
     */
    sponsor(id: string): this;
    /**
     * This endpoint filters offers where the given account is the seller.
     *
     * @see [Offers](https://developers.stellar.org/api/resources/offers/list/)
     * @param {string} seller For example: `GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD`
     * @returns {OfferCallBuilder} current OfferCallBuilder instance
     */
    seller(seller: string): this;
}
