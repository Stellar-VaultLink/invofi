import { Api } from "./api";
export declare const FEDERATION_RESPONSE_MAX_SIZE: number;
/**
 * FederationServer handles a network connection to a
 * [federation server](https://developers.stellar.org/docs/glossary/federation/)
 * instance and exposes an interface for requests to that instance.
 * @class
 * @param {string} serverURL The federation server URL (ex. `https://acme.com/federation`).
 * @param {string} domain Domain this server represents
 * @param {object} [opts] options object
 * @param {boolean} [opts.allowHttp] - Allow connecting to http servers, default: `false`. This must be set to false in production deployments! You can also use {@link Config} class to set this globally.
 * @param {number} [opts.timeout] - Allow a timeout, default: 0. Allows user to avoid nasty lag due to TOML resolve issue. You can also use {@link Config} class to set this globally.
 * @returns {void}
 */
export declare class FederationServer {
    /**
     * The federation server URL (ex. `https://acme.com/federation`).
     *
     * @memberof FederationServer
     */
    private readonly serverURL;
    /**
     * Domain this server represents.
     *
     * @type {string}
     * @memberof FederationServer
     */
    private readonly domain;
    /**
     * Allow a timeout, default: 0. Allows user to avoid nasty lag due to TOML resolve issue.
     *
     * @type {number}
     * @memberof FederationServer
     */
    private readonly timeout;
    /**
     * A helper method for handling user inputs that contain `destination` value.
     * It accepts two types of values:
     *
     * * For Stellar address (ex. `bob*stellar.org`) it splits Stellar address and then tries to find information about
     * federation server in `stellar.toml` file for a given domain. It returns a `Promise` which resolves if federation
     * server exists and user has been found and rejects in all other cases.
     * * For Account ID (ex. `GB5XVAABEQMY63WTHDQ5RXADGYF345VWMNPTN2GFUDZT57D57ZQTJ7PS`) it returns a `Promise` which
     * resolves if Account ID is valid and rejects in all other cases. Please note that this method does not check
     * if the account actually exists in a ledger.
     *
     * Example:
     * ```js
     * StellarSdk.FederationServer.resolve('bob*stellar.org')
     *  .then(federationRecord => {
     *    // {
     *    //   account_id: 'GB5XVAABEQMY63WTHDQ5RXADGYF345VWMNPTN2GFUDZT57D57ZQTJ7PS',
     *    //   memo_type: 'id',
     *    //   memo: 100
     *    // }
     *  });
     * ```
     *
     * @see <a href="https://developers.stellar.org/docs/glossary/federation/" target="_blank">Federation doc</a>
     * @see <a href="https://developers.stellar.org/docs/issuing-assets/publishing-asset-info/" target="_blank">Stellar.toml doc</a>
     * @param {string} value Stellar Address (ex. `bob*stellar.org`)
     * @param {object} [opts] Options object
     * @param {boolean} [opts.allowHttp] - Allow connecting to http servers, default: `false`. This must be set to false in production deployments!
     * @param {number} [opts.timeout] - Allow a timeout, default: 0. Allows user to avoid nasty lag due to TOML resolve issue.
     * @returns {Promise} `Promise` that resolves to a JSON object with this shape:
     * * `account_id` - Account ID of the destination,
     * * `memo_type` (optional) - Memo type that needs to be attached to a transaction,
     * * `memo` (optional) - Memo value that needs to be attached to a transaction.
     */
    static resolve(value: string, opts?: Api.Options): Promise<Api.Record>;
    /**
     * Creates a `FederationServer` instance based on information from
     * [stellar.toml](https://developers.stellar.org/docs/issuing-assets/publishing-asset-info/)
     * file for a given domain.
     *
     * If `stellar.toml` file does not exist for a given domain or it does not
     * contain information about a federation server Promise will reject.
     * ```js
     * StellarSdk.FederationServer.createForDomain('acme.com')
     *   .then(federationServer => {
     *     // federationServer.resolveAddress('bob').then(...)
     *   })
     *   .catch(error => {
     *     // stellar.toml does not exist or it does not contain information about federation server.
     *   });
     * ```
     * @see <a href="https://developers.stellar.org/docs/issuing-assets/publishing-asset-info/" target="_blank">Stellar.toml doc</a>
     * @param {string} domain Domain to get federation server for
     * @param {object} [opts] Options object
     * @param {boolean} [opts.allowHttp] - Allow connecting to http servers, default: `false`. This must be set to false in production deployments!
     * @param {number} [opts.timeout] - Allow a timeout, default: 0. Allows user to avoid nasty lag due to TOML resolve issue.
     * @returns {Promise} `Promise` that resolves to a FederationServer object
     */
    static createForDomain(domain: string, opts?: Api.Options): Promise<FederationServer>;
    constructor(serverURL: string, domain: string, opts?: Api.Options);
    /**
     * Get the federation record if the user was found for a given Stellar address
     * @see <a href="https://developers.stellar.org/docs/glossary/federation/" target="_blank">Federation doc</a>
     * @param {string} address Stellar address (ex. `bob*stellar.org`). If `FederationServer` was instantiated with `domain` param only username (ex. `bob`) can be passed.
     * @returns {Promise} Promise that resolves to the federation record
     */
    resolveAddress(address: string): Promise<Api.Record>;
    /**
     * Given an account ID, get their federation record if the user was found
     * @see <a href="https://developers.stellar.org/docs/glossary/federation/" target="_blank">Federation doc</a>
     * @param {string} accountId Account ID (ex. `GBYNR2QJXLBCBTRN44MRORCMI4YO7FZPFBCNOKTOBCAAFC7KC3LNPRYS`)
     * @returns {Promise} A promise that resolves to the federation record
     */
    resolveAccountId(accountId: string): Promise<Api.Record>;
    /**
     * Given a transactionId, get the federation record if the sender of the transaction was found
     * @see <a href="https://developers.stellar.org/docs/glossary/federation/" target="_blank">Federation doc</a>
     * @param {string} transactionId Transaction ID (ex. `3389e9f0f1a65f19736cacf544c2e825313e8447f569233bb8db39aa607c8889`)
     * @returns {Promise} A promise that resolves to the federation record
     */
    resolveTransactionId(transactionId: string): Promise<Api.Record>;
    private _sendRequest;
}
