import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoicesService } from './invoices.service';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { User } from '../users/user.entity';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let repository: Repository<Invoice>;

  const mockUser: User = { id: 'user1', email: 'originator@example.com', passwordHash: 'hashed', role: 'originator', stellarAccountId: 'G...', invoices: [] };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        {
          provide: getRepositoryToken(Invoice),
          useClass: Repository, // Mock the repository
        },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
    repository = module.get<Repository<Invoice>>(getRepositoryToken(Invoice));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create an invoice', async () => {
    const createInvoiceDto: CreateInvoiceDto = {
      amount: '1000.00', currency: 'USDC', dueDate: new Date('2024-12-31')
    };
    const expectedInvoice = { id: 'invoice1', ...createInvoiceDto, originator: mockUser, status: InvoiceStatus.PENDING, createdAt: new Date(), updatedAt: new Date() };

    jest.spyOn(repository, 'create').mockReturnValue(expectedInvoice as Invoice);
    jest.spyOn(repository, 'save').mockResolvedValue(expectedInvoice as Invoice);

    const result = await service.create(createInvoiceDto, mockUser);
    expect(result).toEqual(expectedInvoice);
    expect(repository.create).toHaveBeenCalledWith({ ...createInvoiceDto, originator: mockUser, status: InvoiceStatus.PENDING });
    expect(repository.save).toHaveBeenCalledWith(expectedInvoice);
  });
});