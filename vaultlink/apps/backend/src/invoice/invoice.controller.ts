import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Request,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto'; // Corrected import path
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoiceController { // Added Logger for debugging
  private readonly logger = new Logger(InvoiceController.name);
  constructor(private invoiceService: InvoiceService) {}

  @Post()
  create(@Body() createInvoiceDto: CreateInvoiceDto, @Request() req: any) { // Explicitly type req
    return this.invoiceService.create(createInvoiceDto, req.user.id); // req.user needs to be typed
  }

  @Get()
  findAll(@Request() req: any) { // Explicitly type req
    return this.invoiceService.findAll(req.user.id); // req.user needs to be typed
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { // ParseUUIDPipe ensures valid UUID
    return this.invoiceService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateData: Partial<CreateInvoiceDto>, // Keep DTO type for incoming data
    @Request() req: any, // Explicitly type req
  ) {
    // Convert amount to string if present in updateData
    if (updateData.amount !== undefined) {
      (updateData as any).amount = String(updateData.amount);
    }
    // Convert dueDate to Date object if present in updateData
    if (updateData.dueDate !== undefined) {
      (updateData as any).dueDate = new Date(updateData.dueDate);
    }
    return this.invoiceService.update(id, updateData as Partial<any>, req.user.id); // Cast to Partial<any> for update
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) { // Explicitly type req
    return this.invoiceService.remove(id, req.user.id); // req.user needs to be typed
  }

  @Post(':id/tokenize')
  tokenize(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) { // Explicitly type req
    return this.invoiceService.tokenize(id, req.user.id); // req.user needs to be typed
  }
}