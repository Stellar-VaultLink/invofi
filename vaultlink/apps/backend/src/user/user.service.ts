import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt'; // Import bcrypt
import { User } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findOneByEmail(email: string): Promise<User | undefined> {
    return (await this.userRepository.findOne({ where: { email } })) || undefined;
  }

  async findByStellarAccountId(stellarAccountId: string): Promise<User | undefined> {
    return (await this.userRepository.findOne({ where: { stellarAccountId } })) || undefined; // Corrected property name and return type
  }

  async create(email: string, password: string, stellarAccountId?: string): Promise<User> {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = this.userRepository.create({
      email,
      passwordHash,
      stellarAccountId,
    });
    return await this.userRepository.save(user);
  }

  async update(id: string, updateData: Partial<User>): Promise<User> {
    await this.userRepository.update(id, updateData);
    return this.findOne(id);
  }
}