import { Contract, Keypair, Networks, TransactionBuilder, rpc as SorobanRpc, nativeToScVal, BASE_FEE } from '@stellar/stellar-sdk';
import { execSync } from 'node:child_process';

// Escrow 012 — distinct-roles release (buyer signs). Base contract id is read
// from TW's read model so nothing is hardcoded per-escrow except the CID.
const CID = 'CDSH3O7SQ64LEXN362BQVECUSY4L56HZUXLNCJ63W5FEWPAHUJP4SO5X';
const KEY = process.env.TW_API_KEY;
const NET = Networks.TESTNET;

const res = await fetch(`https://dev.api.trustlesswork.com/helper/get-escrow-by-contract-ids?contractIds%5B%5D=${CID}`, { headers: { 'x-api-key': KEY } });
const rows = await res.json();
const esc = Array.isArray(rows) ? rows[0] : rows?.data?.[0];
if (!esc) { console.error('escrow not in read model:', await res.text()); process.exit(1); }
const BASE = esc.contractBaseId;
console.log('base:', BASE, '| flags:', JSON.stringify(esc.flags));

const secret = execSync('stellar keys show e2e-buyer', { encoding: 'utf8' }).trim().split(/\s+/).pop();
const buyer = Keypair.fromSecret(secret);

const s = new SorobanRpc.Server('https://soroban-testnet.stellar.org');
const source = await s.getAccount(buyer.publicKey());
const raw = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: NET })
  .addOperation(new Contract(CID).call(
    'release_funds',
    nativeToScVal(buyer.publicKey(), { type: 'address' }),
    nativeToScVal(BASE, { type: 'address' }),
  ))
  .setTimeout(120)
  .build();

const prepared = await s.prepareTransaction(raw); // simulate + attach resource data
prepared.sign(buyer);
let sent = await s.sendTransaction(prepared);
if (sent.status === 'ERROR') { console.log('errorResult:', sent.errorResult?.result()?.switch()?.name); process.exit(1); }
if (sent.status === 'TRY_AGAIN_LATER') sent = await s.sendTransaction(prepared); // stale seq retry
console.log('submit:', sent.status, 'hash:', sent.hash);
for (let i = 0; i < 40; i++) {
  await new Promise(r => setTimeout(r, 3000));
  try {
    const tr = await s.getTransaction(sent.hash);
    if (tr.status === 'SUCCESS') { console.log('RELEASE SUCCESS (buyer-signed) — tx:', sent.hash); process.exit(0); }
    if (tr.status === 'ERROR') { console.log('RELEASE FAILED on-chain:', tr.resultXdr?.result()?.switch()?.name); process.exit(1); }
  } catch { /* not yet included */ }
  process.stdout.write('.');
}
console.log('\ntimed out waiting for inclusion');
