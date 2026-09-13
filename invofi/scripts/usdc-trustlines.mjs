import { Asset, Keypair, Networks, Operation, TransactionBuilder, Horizon } from '@stellar/stellar-sdk';
import { execSync } from 'node:child_process';

// Official testnet USDC per TW docs / Circle — issuer must match exactly.
const ISS = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const asset = new Asset('USDC', ISS);
const H = 'https://horizon-testnet.stellar.org';
const s = new Horizon.Server(H);

const NAMES = ['invofi-deployer', 'e2e-lender', 'e2e-originator', 'e2e-buyer', 'keeper'];

for (const name of NAMES) {
  const kp = Keypair.fromSecret(execSync(`stellar keys show ${name}`, { encoding: 'utf8' }).trim().split(/\s+/).pop());
  const r = await fetch(`${H}/accounts/${kp.publicKey()}`);
  if (r.status === 404) {
    console.log(`${name}: no account — friendbot`);
    await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
    await new Promise(res => setTimeout(res, 5000));
  }
  const acc = await s.loadAccount(kp.publicKey());
  const line = (acc.balances || []).find(b => b.asset_code === 'USDC' && b.asset_issuer === ISS);
  if (line) {
    console.log(`${name}: USDC trustline OK (bal ${line.balance})`);
    continue;
  }
  // Distinguish "no line" from "line on a DIFFERENT issuer"
  const wrong = (acc.balances || []).find(b => b.asset_code === 'USDC' && b.asset_issuer !== ISS);
  const tx = new TransactionBuilder(acc, { fee: '5000', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.changeTrust({ asset, limit: '1000000' }))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  try {
    await s.submitTransaction(tx);
    console.log(`${name}: USDC trustline ADDED${wrong ? ' (had a different-issuer USDC line)' : ''}`);
  } catch (e) {
    console.log(`${name}: FAILED —`, e?.response?.data?.title || e.message);
  }
}
console.log('done');
