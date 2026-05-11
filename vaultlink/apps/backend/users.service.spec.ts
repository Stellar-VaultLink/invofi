import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';
import * as bcrypt from 'bcrypt';

describe('UsersService', () => {
  let service: UsersService;
  let repository: Repository<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useClass: Repository, // Mock the repository
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a user and hash the password', async () => {
    const email = 'test@example.com';
    const password = 'password123';
    const hashedPassword = await bcrypt.hash(password, 10);

    jest.spyOn(repository, 'create').mockReturnValue({ id: '1', email, passwordHash: hashedPassword, role: 'originator', invoices: [] } as User);
    jest.spyOn(repository, 'save').mockResolvedValue({ id: '1', email, passwordHash: hashedPassword, role: 'originator', invoices: [] } as User);

    const user = await service.create(email, password);
    expect(user.email).toEqual(email);
    expect(bcrypt.compareSync(password, user.passwordHash)).toBe(true);
  });
});