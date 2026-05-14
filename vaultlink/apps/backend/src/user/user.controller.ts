import { Controller, Get, Param, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request as ExpressRequest } from 'express'; // Import Request from express

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  async getProfile(@Request() req: ExpressRequest) { // Explicitly type req
    return this.userService.findOne((req.user as any).id); // req.user needs to be typed
  }

  @Get(':id')
  async getUser(@Param('id') id: string) { // Param 'id' is already typed
    return this.userService.findOne(id);
  }

  @Patch('me')
  async updateProfile(@Request() req: ExpressRequest, @Body() updateData: Partial<any>) { // Explicitly type req
    return this.userService.update((req.user as any).id, updateData); // req.user needs to be typed
  }
}