"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const invoice_service_1 = require("./invoice.service");
const invoice_entity_1 = require("./invoice.entity");
describe('InvoicesService', () => {
    let service;
    let repository;
    const mockUser = { id: 'user1', email: 'originator@example.com', passwordHash: 'hashed', role: 'originator', stellarAccountId: 'G...', invoices: [], lendingOffers: [], transactions: [] };
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                invoice_service_1.InvoiceService,
                {
                    provide: (0, typeorm_1.getRepositoryToken)(invoice_entity_1.Invoice),
                    useClass: typeorm_2.Repository,
                },
            ],
        }).compile();
        service = module.get(invoice_service_1.InvoiceService);
        repository = module.get((0, typeorm_1.getRepositoryToken)(invoice_entity_1.Invoice));
    });
    it('should be defined', () => {
        expect(service).toBeDefined();
    });
    it('should create an invoice', async () => {
        const createInvoiceDto = {
            title: 'Test Invoice',
            amount: 1000.00,
            currency: 'USDC',
            issuer: 'Issuer',
            recipient: 'Recipient',
            dueDate: '2024-12-31'
        };
        const expectedInvoice = { id: 'invoice1', ...createInvoiceDto, amount: String(createInvoiceDto.amount), dueDate: new Date(createInvoiceDto.dueDate), createdBy: mockUser, createdById: mockUser.id, status: invoice_entity_1.InvoiceStatus.PENDING, createdAt: new Date(), updatedAt: new Date(), financingOffers: [], contractId: null, tokenId: null };
        jest.spyOn(repository, 'create').mockReturnValue(expectedInvoice);
        jest.spyOn(repository, 'save').mockResolvedValue(expectedInvoice);
        const result = await service.create(createInvoiceDto, mockUser.id);
        expect(result.amount).toEqual(String(createInvoiceDto.amount));
        expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ amount: String(createInvoiceDto.amount), createdById: mockUser.id, status: invoice_entity_1.InvoiceStatus.PENDING }));
        expect(repository.save).toHaveBeenCalledWith(expectedInvoice);
    });
});
//# sourceMappingURL=invoices.service.spec.js.map