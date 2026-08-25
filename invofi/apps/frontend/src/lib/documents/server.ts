import { Readable } from 'node:stream';
import PinataClient from '@pinata/sdk';

/**
 * Server-side helpers for the invoice document workflow (issue #222).
 *
 * These modules are imported only by Next.js route handlers (`app/api/**`),
 * which run on the Node.js runtime — never in the browser. The Pinata API
 * credentials and IPFS gateway URL are server-only environment variables.
 */

/** Default public IPFS gateway used to fetch document bytes back out of IPFS. */
export const DEFAULT_IPFS_GATEWAY_URL = 'https://ipfs.io/ipfs';

export function getIpfsGatewayUrl(): string {
  return process.env.IPFS_GATEWAY_URL ?? DEFAULT_IPFS_GATEWAY_URL;
}

function getPinataClient(): PinataClient {
  const pinataApiKey = process.env.PINATA_API_KEY;
  const pinataSecretApiKey = process.env.PINATA_SECRET_API_KEY;
  if (!pinataApiKey || !pinataSecretApiKey) {
    throw new Error('PINATA_API_KEY and PINATA_SECRET_API_KEY must be set to upload documents.');
  }
  return new PinataClient(pinataApiKey, pinataSecretApiKey);
}

export interface PinataUploadResult {
  /** IPFS content address (CID) of the pinned file. */
  cid: string;
}

/** Pins a file buffer to IPFS via Pinata and returns its CID. */
export async function uploadBufferToPinata(buffer: Buffer, fileName: string): Promise<PinataUploadResult> {
  const client = getPinataClient();
  const result = await client.pinFileToIPFS(Readable.from(buffer), {
    pinataMetadata: { name: fileName },
  });
  return { cid: result.IpfsHash };
}

export interface IpfsFetchResult {
  buffer: Buffer;
  /** The gateway's declared content type, when provided. */
  contentType: string | null;
}

/** Fetches a document's bytes from an IPFS gateway. */
export async function fetchDocumentFromIpfs(cid: string): Promise<IpfsFetchResult> {
  const url = `${getIpfsGatewayUrl().replace(/\/$/, '')}/${cid}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch document from IPFS (HTTP ${response.status}).`);
  }
  const contentType = response.headers.get('content-type');
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}