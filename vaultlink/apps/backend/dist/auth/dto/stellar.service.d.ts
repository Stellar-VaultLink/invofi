import { ConfigService } from '@nestjs/config';
import { Server } from 'stellar-sdk';
export declare class StellarService {
    private configService;
    private readonly logger;
    private server;
    private networkPassphrase;
    constructor(configService: ConfigService);
    getServer(): Server;
    getNetworkPassphrase(): string;
}
