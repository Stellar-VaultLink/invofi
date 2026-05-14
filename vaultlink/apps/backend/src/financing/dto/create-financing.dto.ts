import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

export class CreateFinancingDto {
  @IsString()
  @IsNotEmpty()
  invoiceId!: string;

  @IsNumber()
  amount!: number;

  @IsNumber()
  interestRate!: number;

  @IsNumber()
  duration!: number;
}