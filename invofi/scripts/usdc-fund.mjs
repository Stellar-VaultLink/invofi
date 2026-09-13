import { Horizon, Asset, Operation, TransactionBuilder, Networks, Keypair } from '@stellar/stellar-sdk';
import { execSync } from 'node:child_process';

const ISS = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const usdc = new Asset('USDC', ISS);
const H = 'https://horizon-testnet.stellar.org';
const s = new Horizon.Server(H);

const kp = n => Keypair.fromSecret(execSync(`stellar keys show ${n}`, { encoding: 'utf8' }).trim().split(/\s+/).pop());
const lender = kp('e2e-lender');
const others = ['invofi-deployer', 'e2e-originator', 'e2e-buyer', 'keeper'].map(kp);

// 1) Buy 300 USDC via path payment (XLM -> USDC through testnet DEX)
const pathsRes = await fetch(`${H}/paths?source_account=${lender.publicKey()}&destination_amount=300&destination_asset_type=credit_alphanum4&destination_asset_code=USDC&destination_asset_issuer=${ISS}`);
const pathsJson = await pathsRes.json();
const rec = pathsJson._embedded?.records?.[0];
if (!rec) { console.error('no path found'); process.exit(1); }
const path = (rec.path || []).map(a => (a.asset_type === 'native' ? Asset.native() : new Asset(a.asset_code, a.asset_issuer)));
console.log(`path: pay up to ${rec.source_amount} XLM for 300 USDC (${path.length} hop(s))`);

const acc = await s.loadAccount(lender.publicKey());
const tx1 = new TransactionBuilder(acc, { fee: '5000', networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.pathPaymentStrictReceive({
    sendAsset: Asset.native(),
    sendMax: '400',
    destination: lender.publicKey(),
    destAsset: usdc,
    destAmount: '300',
    path,
  }))
  .setTimeout(60)
  .build();
tx1.sign(lender);
await s.submitTransaction(tx1);
console.log('bought 300 USDC');

// 2) Pre-fund 5 USDC to each other role wallet (TW asset-holding checks)
const acc2 = await s.loadAccount(lender.publicKey());
let b = new TransactionBuilder(acc2, { fee: '5000', networkPassphrase: Networks.TESTNET });
for (const dest of others) b = b.addOperation(Operation.payment({ destination: dest.publicKey(), asset: usdc, amount: '5' }));
const tx2 = b.setTimeout(60).build();
tx2.sign(lender);
await s.submitTransaction(tx2);
console.log('distributed 5 USDC to platform/originator/buyer/keeper');

// 3) Report balances
for (const n of ['e2e-lender', 'invofi-deployer', 'e2e-originator', 'e2e-buyer', 'keeper']) {
  const pk = kp(n).publicKey();
  const acct = await s.loadAccount(pk);
  const line = acct.balances.find(x => x.asset_code === 'USDC');
  console.log(`${n}: ${line ? line.balance : '0'} USDC`);
}
