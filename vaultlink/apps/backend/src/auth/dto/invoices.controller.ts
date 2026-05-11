import { Controller, Get, Post, Body, UseGuards, Request, Param } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  async create(@Body() createInvoiceDto: CreateInvoiceDto, @Request() req) {
    // req.user is populated by JwtAuthGuard
    // In a real app, you'd fetch the full user entity from the DB
    // For simplicity, we'll use a partial user object from the JWT payload
    const originator = { id: req.user.userId, email: req.user.email, role: req.user.role };
    return this.invoicesService.create(createInvoiceDto, originator as any); // Cast for simplicity, proper user entity needed
  }

  @Get()
  async findAll() {
    return this.invoicesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  // Future endpoints:
  // @Patch(':id') update(@Param('id') id: string, @Body() updateInvoiceDto: UpdateInvoiceDto) { ... }
  // @Delete(':id') remove(@Param('id') id: string) { ... }
  // @Post(':id/finance') financeInvoice(@Param('id') id: string, @Body() financeDto: FinanceInvoiceDto) { ... }
}