import { Transaction } from "@stellar/stellar-base";
export declare class Utils {
    /**
     * Verifies if the current date is within the transaction's timebonds
     *
     * @static
     * @function
     * @param {Transaction} transaction the transaction whose timebonds will be validated.
     * @returns {boolean} returns true if the current time is within the transaction's [minTime, maxTime] range.
     */
    static validateTimebounds(transaction: Transaction, gracePeriod?: number): boolean;
}
