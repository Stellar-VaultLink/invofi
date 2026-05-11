import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findOneByEmail(email: string): Promise<User | undefined> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findOneById(id: string): Promise<User | undefined> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async create(email: string, password: string, stellarAccountId?: string): Promise<User> {
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = this.usersRepository.create({ email, passwordHash, stellarAccountId });
    return this.usersRepository.save(newUser);
  }

  async findOneByStellarAccountId(stellarAccountId: string): Promise<User | undefined> {
    return this.usersRepository.findOne({ where: { stellarAccountId } });
  }

  // Add more user-related methods as needed, e.g., updateStellarAccountId
}