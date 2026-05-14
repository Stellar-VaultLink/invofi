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
exports.InvoiceService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const decimal_js_1 = require("decimal.js");
const invoice_entity_1 = require("./invoice.entity");
const transaction_service_1 = require("../transaction/transaction.service");
let InvoiceService = class InvoiceService {
    invoiceRepository;
    transactionService;
    constructor(invoiceRepository, transactionService) {
        this.invoiceRepository = invoiceRepository;
        this.transactionService = transactionService;
    }
    async create(createInvoiceDto, userId) {
        const amountString = new decimal_js_1.Decimal(createInvoiceDto.amount).toFixed(7);
        const invoice = this.invoiceRepository.create({
            ...createInvoiceDto,
            amount: amountString,
            dueDate: new Date(createInvoiceDto.dueDate),
            createdById: userId,
        });
        return await this.invoiceRepository.save(invoice);
    }
    async findAll(userId) {
        if (userId) {
            return this.invoiceRepository.find({
                where: { createdById: userId },
                relations: ['financingOffers'],
            });
        }
        return this.invoiceRepository.find({ relations: ['financingOffers'] });
    }
    async findOne(id) {
        const invoice = await this.invoiceRepository.findOne({
            where: { id },
            relations: ['createdBy', 'financingOffers'],
        });
        if (!invoice) {
            throw new common_1.NotFoundException('Invoice not found');
        }
        return invoice;
    }
    async update(id, updateData, userId) {
        const invoice = await this.findOne(id);
        if (invoice.createdById !== userId && invoice.status !== invoice_entity_1.InvoiceStatus.DRAFT) {
            throw new common_1.ForbiddenException('Cannot update non-draft invoice');
        }
        if (updateData.amount !== undefined) {
            updateData.amount = new decimal_js_1.Decimal(updateData.amount).toFixed(7);
        }
        if (updateData.dueDate !== undefined && typeof updateData.dueDate === 'string') {
            updateData.dueDate = new Date(updateData.dueDate);
        }
        Object.assign(invoice, updateData);
        return await this.invoiceRepository.save(invoice);
    }
    async remove(id, userId) {
        const invoice = await this.findOne(id);
        if (invoice.createdById !== userId) {
            throw new common_1.ForbiddenException('Cannot delete another user\'s invoice');
        }
        await this.invoiceRepository.remove(invoice);
    }
    async tokenize(id, userId) {
        const invoice = await this.findOne(id);
        if (invoice.createdById !== userId) {
            throw new common_1.ForbiddenException('Cannot tokenize another user\'s invoice');
        }
        if (invoice.status !== invoice_entity_1.InvoiceStatus.DRAFT) {
            throw new common_1.ForbiddenException('Only draft invoices can be tokenized');
        }
        const transaction = await this.transactionService.createInvoiceToken(invoice);
        invoice.status = invoice_entity_1.InvoiceStatus.PENDING;
        invoice.contractId = transaction.contractId;
        invoice.tokenId = transaction.tokenId;
        return this.invoiceRepository.save(invoice);
    }
};
exports.InvoiceService = InvoiceService;
exports.InvoiceService = InvoiceService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(invoice_entity_1.Invoice)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        transaction_service_1.TransactionService])
], InvoiceService);
//# sourceMappingURL=invoice.service.js.map