import { IsString, IsNumberString, IsDateString, IsNotEmpty } from 'class-validator';

export class CreateInvoiceDto {
  @IsNotEmpty()
  @IsNumberString() // Use IsNumberString for amounts to handle large numbers and decimal strings
  amount: string;

  @IsNotEmpty()
  @IsString()
  currency: string; // e.g., 'XLM', 'USDC'

  @IsNotEmpty()
  @IsDateString()
  dueDate: Date;

  // Add other relevant invoice fields like description, client info, etc.
}