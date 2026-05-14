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
exports.InvoicesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const invoice_entity_1 = require("./invoice.entity");
let InvoicesService = class InvoicesService {
    invoicesRepository;
    constructor(invoicesRepository) {
        this.invoicesRepository = invoicesRepository;
    }
    async create(createInvoiceDto, originator) {
        const newInvoice = this.invoicesRepository.create({
            amount: createInvoiceDto.amount.toString(),
            currency: createInvoiceDto.currency,
            dueDate: new Date(createInvoiceDto.dueDate),
            originator,
            status: invoice_entity_1.InvoiceStatus.PENDING,
        });
        return this.invoicesRepository.save(newInvoice);
    }
    async findAll() {
        return this.invoicesRepository.find({ relations: ['originator'] });
    }
    async findOne(id) {
        const invoice = await this.invoicesRepository.findOne({ where: { id }, relations: ['originator'] });
        if (!invoice)
            throw new common_1.NotFoundException(`Invoice with ID "${id}" not found`);
        return invoice;
    }
};
exports.InvoicesService = InvoicesService;
exports.InvoicesService = InvoicesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(invoice_entity_1.Invoice)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], InvoicesService);
//# sourceMappingURL=invoices.service.js.map