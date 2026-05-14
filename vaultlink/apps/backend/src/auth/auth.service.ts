import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from 'stellar-sdk';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.userService.findOneByEmail(email);
    if (user && (await bcrypt.compare(pass, user.passwordHash))) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async register(email: string, password: string, stellarAccountId?: string) {
    const existingUser = await this.userService.findOneByEmail(email);
    if (existingUser) {
      throw new UnauthorizedException('User with this email already exists');
    }
    const newUser = await this.userService.create(email, password, stellarAccountId);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...result } = newUser;
    return result;
  }

  async verifyStellarSignature(publicKey: string, signature: string, message: string): Promise<boolean> {
    try {
      const kp = Keypair.fromPublicKey(publicKey);
      return kp.verify(Buffer.from(message), Buffer.from(signature, 'base64'));
    } catch (e) {
      console.error('Signature verification failed:', e);
      return false;
    }
  }
}