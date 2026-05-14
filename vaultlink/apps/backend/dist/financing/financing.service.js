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
exports.FinancingService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const financing_offer_entity_1 = require("./financing-offer.entity");
const invoice_service_1 = require("../invoice/invoice.service");
const transaction_service_1 = require("../transaction/transaction.service");
let FinancingService = class FinancingService {
    offerRepository;
    invoiceService;
    transactionService;
    constructor(offerRepository, invoiceService, transactionService) {
        this.offerRepository = offerRepository;
        this.invoiceService = invoiceService;
        this.transactionService = transactionService;
    }
    async create(createFinancingDto, userId) {
        const invoice = await this.invoiceService.findOne(createFinancingDto.invoiceId);
        const offer = this.offerRepository.create({
            ...createFinancingDto,
            amount: createFinancingDto.amount.toString(),
            lenderId: userId,
        });
        return await this.offerRepository.save(offer);
    }
    async findAll(userId) {
        if (userId) {
            return this.offerRepository.find({
                where: { lenderId: userId },
                relations: ['invoice', 'invoice.createdBy'],
            });
        }
        return this.offerRepository.find({
            relations: ['invoice', 'invoice.createdBy', 'lender'],
        });
    }
    async findOne(id) {
        const offer = await this.offerRepository.findOne({
            where: { id },
            relations: ['invoice', 'lender'],
        });
        if (!offer) {
            throw new common_1.NotFoundException('Financing offer not found');
        }
        return offer;
    }
    async accept(id, userId) {
        const offer = await this.findOne(id);
        if (offer.invoice.createdById !== userId) {
            throw new common_1.ForbiddenException('Only invoice creator can accept offers');
        }
        if (offer.status !== financing_offer_entity_1.OfferStatus.PENDING) {
            throw new common_1.ForbiddenException('Offer is not pending');
        }
        const transaction = await this.transactionService.acceptOffer(offer);
        offer.status = financing_offer_entity_1.OfferStatus.ACCEPTED;
        offer.contractId = transaction.contractId;
        return this.offerRepository.save(offer);
    }
};
exports.FinancingService = FinancingService;
exports.FinancingService = FinancingService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(financing_offer_entity_1.FinancingOffer)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        invoice_service_1.InvoiceService,
        transaction_service_1.TransactionService])
], FinancingService);
//# sourceMappingURL=financing.service.js.map