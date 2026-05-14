import { ConfigService } from '@nestjs/config';
export declare class StellarService {
    private configService;
    private readonly logger;
    private readonly networkPassphrase;
    constructor(configService: ConfigService);
    verifySignature(publicKey: string, message: string, signature: string): boolean;
    isValidPublicKey(publicKey: string): boolean;
    getNetworkPassphrase(): string;
}
