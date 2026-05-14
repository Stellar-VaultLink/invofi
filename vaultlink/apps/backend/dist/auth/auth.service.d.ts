import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
export declare class AuthService {
    private userService;
    private jwtService;
    constructor(userService: UserService, jwtService: JwtService);
    validateUser(email: string, pass: string): Promise<any>;
    login(user: any): Promise<{
        access_token: string;
    }>;
    register(email: string, password: string, stellarAccountId?: string): Promise<{
        id: string;
        email: string;
        stellarAccountId?: string;
        role: string;
        invoices: import("../invoice/invoice.entity").Invoice[];
        lendingOffers: import("../financing/financing-offer.entity").FinancingOffer[];
        transactions: import("../transaction/transaction.entity").Transaction[];
    }>;
    verifyStellarSignature(publicKey: string, signature: string, message: string): Promise<boolean>;
}
