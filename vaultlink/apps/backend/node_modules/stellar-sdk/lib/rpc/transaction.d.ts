import { FeeBumpTransaction, Transaction, TransactionBuilder } from '@stellar/stellar-base';
import { Api } from './api';
/**
 * Combines the given raw transaction alongside the simulation results.
 * If the given transaction already has authorization entries in a host
 *    function invocation (see {@link Operation.invokeHostFunction}), **the
 *    simulation entries are ignored**.
 *
 * @param raw         the initial transaction, w/o simulation applied
 * @param simulation  the Soroban RPC simulation result (see
 *    {@link Server.simulateTransaction})
 *
 * @returns a new, cloned transaction with the proper auth and resource (fee,
 *    footprint) simulation data applied
 *
 * @see {Server.simulateTransaction}
 * @see {Server.prepareTransaction}
 */
export declare function assembleTransaction(raw: Transaction | FeeBumpTransaction, simulation: Api.SimulateTransactionResponse | Api.RawSimulateTransactionResponse): TransactionBuilder;
