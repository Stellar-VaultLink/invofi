import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FinancingService } from './financing.service';
import { CreateFinancingDto } from './dto/create-financing.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('financing')
@UseGuards(JwtAuthGuard)
export class FinancingController {
  constructor(private financingService: FinancingService) {}

  @Post('offers')
  create(@Body() createFinancingDto: CreateFinancingDto, @Request() req) {
    return this.financingService.create(createFinancingDto, req.user.id);
  }

  @Get('offers')
  findAll(@Request() req) {
    return this.financingService.findAll(req.user.id);
  }

  @Get('offers/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.financingService.findOne(id);
  }

  @Patch('offers/:id/accept')
  accept(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.financingService.accept(id, req.user.id);
  }
}