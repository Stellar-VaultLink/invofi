import {
  isConnected,
  isAllowed,
  getAddress,
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
  if (!accessResult.isAllowed) {
    throw new Error('Freighter access was denied. Please approve the connection in the extension.');
  }

  const addrResult = await getAddress();
  if (addrResult.error) throw new Error(String(addrResult.error));

  return addrResult.address;
}

export async function getFreighterPublicKey(): Promise<string | null> {
  try {
    const allowed = await isFreighterAllowed();
    if (!allowed) return null;
    const result = await getAddress();
    if (result.error) return null;
    return result.address;
  } catch {
    return null;
  }
}

// v6: signTransaction takes networkPassphrase (not network name)
export async function signTxWithFreighter(
  txXdr: string,
  networkPassphrase: string,
): Promise<string> {
  const result = await signTransaction(txXdr, { networkPassphrase });
  if (result.error) throw new Error(String(result.error));
  return result.signedTxXdr;
}
