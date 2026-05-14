import { IsString, Matches } from 'class-validator';

export class ConnectWalletDto {
  @IsString()
  @Matches(/^G[A-Za-z0-9]{55}$/, {
    message: 'Invalid Stellar public key format',
  })
  publicKey!: string;

  @IsString()
  signature!: string;

  @IsString()
  message!: string;
}