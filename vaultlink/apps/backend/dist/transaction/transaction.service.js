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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const transaction_entity_1 = require("./transaction.entity");
let TransactionService = class TransactionService {
    transactionRepository;
    constructor(transactionRepository) {
        this.transactionRepository = transactionRepository;
    }
    async createInvoiceToken(invoice) {
        const transaction = this.transactionRepository.create({
            type: transaction_entity_1.TransactionType.INVOICE_TOKENIZATION,
            txHash: `0x${Math.random().toString(16).substring(2, 66)}`,
            contractId: `contract_${Date.now()}`,
            tokenId: `token_${Date.now()}`,
            userId: invoice.createdById,
            invoiceId: invoice.id,
            status: transaction_entity_1.TransactionStatus.COMPLETED,
        });
        return this.transactionRepository.save(transaction);
    }
    async acceptOffer(offer) {
        const transaction = this.transactionRepository.create({
            type: transaction_entity_1.TransactionType.OFFER_ACCEPTANCE,
            txHash: `0x${Math.random().toString(16).substring(2, 66)}`,
            contractId: `financing_${Date.now()}`,
            userId: offer.invoice.createdById,
            offerId: offer.id,
            invoiceId: offer.invoiceId,
            status: transaction_entity_1.TransactionStatus.COMPLETED,
        });
        return this.transactionRepository.save(transaction);
    }
    async createRepayment(offer) {
        const transaction = this.transactionRepository.create({
            type: transaction_entity_1.TransactionType.REPAYMENT,
            txHash: `0x${Math.random().toString(16).substring(2, 66)}`,
            contractId: `repayment_${Date.now()}`,
            userId: offer.invoice.createdById,
            offerId: offer.id,
            invoiceId: offer.invoiceId,
            status: transaction_entity_1.TransactionStatus.COMPLETED,
        });
        return this.transactionRepository.save(transaction);
    }
};
exports.TransactionService = TransactionService;
exports.TransactionService = TransactionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(transaction_entity_1.Transaction)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], TransactionService);
//# sourceMappingURL=transaction.service.js.map