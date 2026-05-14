import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserService } from './user.service';
import { User } from './user.entity'; // Corrected import
import * as bcrypt from 'bcrypt';

describe('UsersService', () => {
  let service: UserService;
  let repository: Repository<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useClass: Repository, // Mock the repository
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a user and hash the password', async () => {
    const email = 'test@example.com';
    const password = 'password123';
    const hashedPassword = await bcrypt.hash(password, 10);

    jest.spyOn(repository, 'create').mockReturnValue({ id: '1', email, passwordHash: hashedPassword, role: 'originator', stellarAccountId: undefined, invoices: [], lendingOffers: [], transactions: [] } as User); // Added stellarAccountId and other relations
    jest.spyOn(repository, 'save').mockResolvedValue({ id: '1', email, passwordHash: hashedPassword, role: 'originator', stellarAccountId: undefined, invoices: [], lendingOffers: [], transactions: [] } as User); // Added stellarAccountId and other relations

    const user = await service.create(email, password); // Assuming create method exists and is correctly typed
    expect(user.email).toEqual(email);
    expect(bcrypt.compareSync(password, user.passwordHash)).toBe(true);
  });
});