import { Controller, Get, Param, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  async getProfile(@Request() req) {
    return this.userService.findOne(req.user.id);
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Patch('me')
  async updateProfile(@Request() req, @Body() updateData: Partial<any>) {
    return this.userService.update(req.user.id, updateData);
  }
}