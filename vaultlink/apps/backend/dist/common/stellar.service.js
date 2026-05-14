"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var StellarService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StellarService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const stellar_sdk_1 = require("stellar-sdk");
let StellarService = StellarService_1 = class StellarService {
    configService;
    logger = new common_1.Logger(StellarService_1.name);
    networkPassphrase;
    constructor(configService) {
        this.configService = configService;
        const network = this.configService.get('STELLAR_NETWORK', 'testnet');
        this.networkPassphrase =
            network === 'mainnet' ? stellar_sdk_1.Networks.PUBLIC : stellar_sdk_1.Networks.TESTNET;
    }
    verifySignature(publicKey, message, signature) {
        try {
            const keypair = stellar_sdk_1.Keypair.fromPublicKey(publicKey);
            return keypair.verify(Buffer.from(message), Buffer.from(signature, 'base64'));
        }
        catch (error) {
            this.logger.error(`Signature verification failed: ${error.message}`);
            return false;
        }
    }
    isValidPublicKey(publicKey) {
        try {
            stellar_sdk_1.Keypair.fromPublicKey(publicKey);
            return true;
        }
        catch {
            return false;
        }
    }
    getNetworkPassphrase() {
        return this.networkPassphrase;
    }
};
exports.StellarService = StellarService;
exports.StellarService = StellarService = StellarService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], StellarService);
//# sourceMappingURL=stellar.service.js.map