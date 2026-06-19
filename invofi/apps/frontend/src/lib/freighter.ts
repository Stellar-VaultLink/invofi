import {
  isConnected,
  isAllowed,
  getPublicKey,
  signTransaction,
  requestAccess,
} from '@stellar/freighter-api';

export async function isFreighterInstalled(): Promise<boolean> {
  try {
    const result = await isConnected();
    return result.isConnected;
  } catch {
    return false;
  }
}

export async function isFreighterAllowed(): Promise<boolean> {
  try {
    const result = await isAllowed();
    return result.isAllowed;
  } catch {
    return false;
  }
}

export async function connectFreighter(): Promise<string> {
  const accessResult = await requestAccess();
  if (accessResult.error) throw new Error(accessResult.error);

  const keyResult = await getPublicKey();
  if (keyResult.error) throw new Error(keyResult.error);

  return keyResult.publicKey;
}

export async function getFreighterPublicKey(): Promise<string | null> {
  try {
    const allowed = await isFreighterAllowed();
    if (!allowed) return null;
    const result = await getPublicKey();
    if (result.error) return null;
    return result.publicKey;
  } catch {
    return null;
  }
}

export async function signTxWithFreighter(
  txXdr: string,
  network: 'TESTNET' | 'PUBLIC' = 'TESTNET',
): Promise<string> {
  const result = await signTransaction(txXdr, { network });
  if (result.error) throw new Error(result.error);
  return result.signedTxXdr;
}
