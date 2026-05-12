import { Keypair } from "@stellar/stellar-base";
/**
 * For use with {@link Client} and {@link AssembledTransaction}.
 * Implements `signTransaction` and `signAuthEntry` with signatures expected by
 * those classes. This is useful for testing and maybe some simple Node
 * applications. Feel free to use this as a starting point for your own
 * Wallet/TransactionSigner implementation.
 */
export declare const basicNodeSigner: (keypair: Keypair, networkPassphrase: string) => {
    signTransaction: (tx: string) => Promise<string>;
    signAuthEntry: (entryXdr: string) => Promise<string>;
};
