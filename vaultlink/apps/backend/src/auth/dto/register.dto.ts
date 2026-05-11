import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @IsOptional()
  @IsString()
  stellarAccountId?: string; // Optional: User can link Stellar account later

  // In a real application, you might want to add a 'role' field
  // and validate it, or assign a default role upon registration.
  // @IsOptional()
  // @IsString()
  // role?: string;
}