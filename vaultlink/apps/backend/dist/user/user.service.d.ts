import { Repository } from 'typeorm';
import { User } from './user.entity';
export declare class UserService {
    private userRepository;
    constructor(userRepository: Repository<User>);
    findOne(id: string): Promise<User>;
    findOneByEmail(email: string): Promise<User | undefined>;
    findByStellarAccountId(stellarAccountId: string): Promise<User | undefined>;
    create(email: string, password: string, stellarAccountId?: string): Promise<User>;
    update(id: string, updateData: Partial<User>): Promise<User>;
}
