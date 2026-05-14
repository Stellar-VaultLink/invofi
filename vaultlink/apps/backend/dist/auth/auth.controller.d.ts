import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import { UserService } from '../user/user.service';
export declare class AuthController {
    private authService;
    private userService;
    constructor(authService: AuthService, userService: UserService);
    login(req: any, loginDto: LoginDto): Promise<{
        access_token: string;
    }>;
    register(registerDto: RegisterDto): Promise<{
        id: string;
        email: string;
        stellarAccountId?: string;
        role: string;
        invoices: import("../invoice/invoice.entity").Invoice[];
        lendingOffers: import("../financing/financing-offer.entity").FinancingOffer[];
        transactions: import("../transaction/transaction.entity").Transaction[];
    }>;
    stellarLogin(connectWalletDto: ConnectWalletDto): Promise<{
        access_token: string;
    }>;
}
