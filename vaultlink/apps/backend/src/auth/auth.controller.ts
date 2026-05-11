import { Controller, Request, Post, UseGuards, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService, // Inject UsersService
  ) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req, @Body() loginDto: LoginDto) {
    // LocalAuthGuard already validated the user and attached it to req.user
    return this.authService.login(req.user);
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    const { email, password, stellarAccountId } = registerDto;
    return this.authService.register(email, password, stellarAccountId);
  }

  @Post('stellar-login') // This endpoint handles login via Stellar wallet signature
  async stellarLogin(@Body() connectWalletDto: ConnectWalletDto) {
    const { publicKey, signature, message } = connectWalletDto;
    const isValid = await this.authService.verifyStellarSignature(publicKey, signature, message);

    if (!isValid) {
      throw new UnauthorizedException('Invalid Stellar signature');
    }

    // Find user by stellarAccountId
    const user: User | undefined = await this.usersService.findOneByStellarAccountId(publicKey);

    if (!user) {
      throw new UnauthorizedException('No user found with this Stellar account. Please register or link your wallet first.');
    }

    return this.authService.login(user);
  }
}