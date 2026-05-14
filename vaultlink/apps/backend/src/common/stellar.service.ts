import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Keypair,
  Networks,
  TransactionBuilder,
  FeeBumpTransaction,
  Transaction,
  xdr,
} from 'stellar-sdk';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private readonly networkPassphrase: string;

  constructor(private configService: ConfigService) {
    const network = this.configService.get('STELLAR_NETWORK', 'testnet');
    this.networkPassphrase =
      network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
  }

  verifySignature(
    publicKey: string,
    message: string,
    signature: string,
  ): boolean {
    try {
      const keypair = Keypair.fromPublicKey(publicKey);
      return keypair.verify(Buffer.from(message), Buffer.from(signature, 'base64'));
    } catch (error: any) {
      this.logger.error(`Signature verification failed: ${error.message}`);
      return false;
    }
  }

  isValidPublicKey(publicKey: string): boolean {
    try {
      Keypair.fromPublicKey(publicKey);
      return true;
    } catch {
      return false;
    }
  }

  getNetworkPassphrase(): string {
    return this.networkPassphrase;
  }
}