import {
  Contract,
  Networks,
  rpc as SorobanRpc,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { signTxWithFreighter } from './freighter';
import type { Currency, FinancingOffer, Invoice } from '@/types';

const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID!;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
const NETWORK_PASSPHRASE = NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
const BASE_FEE = '100';

function server() {
  return new SorobanRpc.Server(RPC_URL, { allowHttp: false });
}

function encodeSymbol(value: string): xdr.ScVal {
  return xdr.ScVal.scvSymbol(value);
}

function encodeAddress(address: string): xdr.ScVal {
  return nativeToScVal(address, { type: 'address' });
}

function encodeI128(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: 'i128' });
}

function encodeU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: 'u32' });
}

function encodeU64(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: 'u64' });
}

async function invokeContract(
  method: string,
  args: xdr.ScVal[],
  sourceAddress: string,
): Promise<xdr.ScVal> {
  const rpc = server();
  const account = await rpc.getAccount(sourceAddress);
  const contract = new Contract(CONTRACT_ID);

  let tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simResult = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  tx = SorobanRpc.assembleTransaction(tx, simResult).build();
  const signedXdr = await signTxWithFreighter(tx.toXDR(), NETWORK_PASSPHRASE);
  const signedTx = new Transaction(signedXdr, NETWORK_PASSPHRASE);

  const sendResult = await rpc.sendTransaction(signedTx);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Transaction failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  let getResult = await rpc.getTransaction(sendResult.hash);
  for (let attempts = 0; attempts < 20 && getResult.status === 'NOT_FOUND'; attempts++) {
    await new Promise(r => setTimeout(r, 1000));
    getResult = await rpc.getTransaction(sendResult.hash);
  }

  if (getResult.status !== 'SUCCESS') {
    throw new Error(`Transaction did not succeed: ${getResult.status}`);
  }

  return getResult.returnValue ?? xdr.ScVal.scvVoid();
}

function parseInvoice(val: xdr.ScVal): Invoice {
  return scValToNative(val) as Invoice;
}

function parseOffer(val: xdr.ScVal): FinancingOffer {
  return scValToNative(val) as FinancingOffer;
}

// ── Read-only calls (use simulateTransaction, no signing needed) ──────────────

async function readContract(method: string, args: xdr.ScVal[]): Promise<xdr.ScVal> {
  const rpc = server();
  const contract = new Contract(CONTRACT_ID);

  // Use a throw-away account for reads (any valid account works)
  const dummyKeypair = { publicKey: () => 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN' };
  const account = await rpc.getAccount(dummyKeypair.publicKey()).catch(() => {
    throw new Error('RPC unavailable');
  });

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Read failed: ${sim.error}`);
  }
  if (!SorobanRpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error('Read simulation returned no result');
  }
  return sim.result.retval;
}

// ── Public contract API ───────────────────────────────────────────────────────

export async function registerInvoice(
  params: {
    id: string;
    amount: bigint;
    currency: Currency;
    dueDate: number;
  },
  originatorAddress: string,
): Promise<Invoice> {
  const val = await invokeContract(
    'register_invoice',
    [
      encodeSymbol(params.id),
      encodeAddress(originatorAddress),
      encodeI128(params.amount),
      encodeSymbol(params.currency),
      encodeU64(BigInt(params.dueDate)),
    ],
    originatorAddress,
  );
  return parseInvoice(val);
}

export async function getInvoice(id: string): Promise<Invoice> {
  const val = await readContract('get_invoice', [encodeSymbol(id)]);
  return parseInvoice(val);
}

export async function createOffer(
  params: {
    offerId: string;
    invoiceId: string;
    amount: bigint;
    currency: Currency;
    interestRate: number;
    duration: number;
  },
  lenderAddress: string,
): Promise<FinancingOffer> {
  const val = await invokeContract(
    'create_offer',
    [
      encodeSymbol(params.offerId),
      encodeSymbol(params.invoiceId),
      encodeAddress(lenderAddress),
      encodeI128(params.amount),
      encodeSymbol(params.currency),
      encodeU32(params.interestRate),
      encodeU64(BigInt(params.duration)),
    ],
    lenderAddress,
  );
  return parseOffer(val);
}

export async function getOffer(id: string): Promise<FinancingOffer> {
  const val = await readContract('get_offer', [encodeSymbol(id)]);
  return parseOffer(val);
}

export async function acceptOffer(
  offerId: string,
  originatorAddress: string,
): Promise<FinancingOffer> {
  const val = await invokeContract(
    'accept_offer',
    [encodeSymbol(offerId), encodeAddress(originatorAddress)],
    originatorAddress,
  );
  return parseOffer(val);
}

export async function rejectOffer(
  offerId: string,
  originatorAddress: string,
): Promise<FinancingOffer> {
  const val = await invokeContract(
    'reject_offer',
    [encodeSymbol(offerId), encodeAddress(originatorAddress)],
    originatorAddress,
  );
  return parseOffer(val);
}

export async function repayInvoice(
  invoiceId: string,
  offerId: string,
  repayerAddress: string,
): Promise<Invoice> {
  const val = await invokeContract(
    'repay_invoice',
    [
      encodeSymbol(invoiceId),
      encodeSymbol(offerId),
      encodeAddress(repayerAddress),
    ],
    repayerAddress,
  );
  return parseInvoice(val);
}
