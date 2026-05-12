import { Spec } from "./spec";
import { AssembledTransaction } from "./assembled_transaction";
import type { ClientOptions } from "./types";
export declare class Client {
    /** {@link Spec} to construct a Client for */
    readonly spec: Spec;
    /** see {@link ClientOptions} */
    readonly options: ClientOptions;
    /**
     * Generate a class from the contract spec that where each contract method
     * gets included with an identical name.
     *
     * Each method returns an {@link AssembledTransaction} that can be used to
     * modify, simulate, decode results, and possibly sign, & submit the
     * transaction.
     */
    constructor(
    /** {@link Spec} to construct a Client for */
    spec: Spec, 
    /** see {@link ClientOptions} */
    options: ClientOptions);
    /**
     * Generates a Client instance from the provided ClientOptions and the contract's wasm hash.
     * The wasmHash can be provided in either hex or base64 format.
     *
     * @param wasmHash The hash of the contract's wasm binary, in either hex or base64 format.
     * @param options The ClientOptions object containing the necessary configuration, including the rpcUrl.
     * @param format The format of the provided wasmHash, either "hex" or "base64". Defaults to "hex".
     * @returns A Promise that resolves to a Client instance.
     * @throws {TypeError} If the provided options object does not contain an rpcUrl.
     */
    static fromWasmHash(wasmHash: Buffer | string, options: ClientOptions, format?: "hex" | "base64"): Promise<Client>;
    /**
     * Generates a Client instance from the provided ClientOptions and the contract's wasm binary.
     *
     * @param wasm The contract's wasm binary as a Buffer.
     * @param options The ClientOptions object containing the necessary configuration.
     * @returns A Promise that resolves to a Client instance.
     * @throws {Error} If the contract spec cannot be obtained from the provided wasm binary.
     */
    static fromWasm(wasm: Buffer, options: ClientOptions): Promise<Client>;
    /**
     * Generates a Client instance from the provided ClientOptions, which must include the contractId and rpcUrl.
     *
     * @param options The ClientOptions object containing the necessary configuration, including the contractId and rpcUrl.
     * @returns A Promise that resolves to a Client instance.
     * @throws {TypeError} If the provided options object does not contain both rpcUrl and contractId.
     */
    static from(options: ClientOptions): Promise<Client>;
    txFromJSON: <T>(json: string) => AssembledTransaction<T>;
    txFromXDR: <T>(xdrBase64: string) => AssembledTransaction<T>;
}
