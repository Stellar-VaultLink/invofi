import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceService } from './invoice.service';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { User } from '../user/user.entity';

describe('InvoicesService', () => {
  let service: InvoiceService;
  let repository: Repository<Invoice>;

  const mockUser: User = { id: 'user1', email: 'originator@example.com', passwordHash: 'hashed', role: 'originator', stellarAccountId: 'G...', invoices: [], lendingOffers: [], transactions: [] };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        {
          provide: getRepositoryToken(Invoice),
          useClass: Repository, // Mock the repository
        },
      ],
    }).compile();

    service = module.get<InvoiceService>(InvoiceService);
    repository = module.get<Repository<Invoice>>(getRepositoryToken(Invoice));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create an invoice', async () => {
    const createInvoiceDto: CreateInvoiceDto = {
      title: 'Test Invoice',
      amount: 1000.00,
      currency: 'USDC',
      issuer: 'Issuer',
      recipient: 'Recipient',
      dueDate: '2024-12-31'
    };
    const expectedInvoice = { id: 'invoice1', ...createInvoiceDto, amount: String(createInvoiceDto.amount), dueDate: new Date(createInvoiceDto.dueDate), createdBy: mockUser, createdById: mockUser.id, status: InvoiceStatus.PENDING, createdAt: new Date(), updatedAt: new Date(), financingOffers: [], contractId: null, tokenId: null };

    jest.spyOn(repository, 'create').mockReturnValue(expectedInvoice as any); // Cast to any for mock
    jest.spyOn(repository, 'save').mockResolvedValue(expectedInvoice as any); // Cast to any for mock

    const result = await service.create(createInvoiceDto, mockUser.id); // Pass userId
    expect(result.amount).toEqual(String(createInvoiceDto.amount)); // Compare string amount
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ amount: String(createInvoiceDto.amount), createdById: mockUser.id, status: InvoiceStatus.PENDING }));
    expect(repository.save).toHaveBeenCalledWith(expectedInvoice);
  });
});