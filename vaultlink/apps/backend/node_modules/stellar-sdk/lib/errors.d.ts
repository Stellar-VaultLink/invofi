import { HorizonApi } from "./horizon/horizon_api";
export declare class NetworkError extends Error {
    response: {
        data?: HorizonApi.ErrorResponseData;
        status?: number;
        statusText?: string;
        url?: string;
    };
    __proto__: NetworkError;
    constructor(message: string, response: any);
    getResponse(): {
        data?: HorizonApi.ErrorResponseData;
        status?: number;
        statusText?: string;
        url?: string;
    };
}
export declare class NotFoundError extends NetworkError {
    constructor(message: string, response: any);
}
export declare class BadRequestError extends NetworkError {
    constructor(message: string, response: any);
}
export declare class BadResponseError extends NetworkError {
    constructor(message: string, response: any);
}
/**
 * AccountRequiresMemoError is raised when a transaction is trying to submit an
 * operation to an account which requires a memo. See
 * [SEP0029](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0029.md)
 * for more information.
 *
 * This error contains two attributes to help you identify the account requiring
 * the memo and the operation where the account is the destination
 *
 * ```
 * console.log('The following account requires a memo ', err.accountId)
 * console.log('The account is used in operation: ', err.operationIndex)
 * ```
 *
 */
export declare class AccountRequiresMemoError extends Error {
    __proto__: AccountRequiresMemoError;
    /**
     * accountId account which requires a memo.
     */
    accountId: string;
    /**
     * operationIndex operation where accountId is the destination.
     */
    operationIndex: number;
    /**
     * Create an AccountRequiresMemoError
     * @param {message} message - error message
     * @param {string} accountId - The account which requires a memo.
     * @param {number} operationIndex - The index of the operation where `accountId` is the destination.
     */
    constructor(message: string, accountId: string, operationIndex: number);
}
