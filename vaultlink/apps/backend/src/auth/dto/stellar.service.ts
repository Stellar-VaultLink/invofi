import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from 'stellar-sdk';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private server: StellarSdk.Server;
  private networkPassphrase: string;

  constructor(private configService: ConfigService) {
    const horizonUrl = this.configService.get<string>('stellar.horizonUrl');
    const network = this.configService.get<string>('stellar.network');

    this.server = new StellarSdk.Server(horizonUrl);
    this.networkPassphrase = network === 'testnet' ? StellarSdk.Networks.TESTNET : StellarSdk.Networks.PUBLIC;
    StellarSdk.Network.use(new StellarSdk.Network(this.networkPassphrase));

    this.logger.log(`Stellar Service initialized for network: ${network} (${horizonUrl})`);
  }

  getServer(): StellarSdk.Server {
    return this.server;
  }

  getNetworkPassphrase(): string {
    return this.networkPassphrase;
  }

  // Add methods for interacting with Soroban contracts here
}