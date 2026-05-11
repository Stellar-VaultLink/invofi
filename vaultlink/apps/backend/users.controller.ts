import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    // In a real application, you might want to select specific fields
    // to return and not expose the password hash.
    const { passwordHash, ...result } = req.user;
    return result;
  }

  // Example: Get user by ID (admin or self-access)
  // @UseGuards(JwtAuthGuard)
  // @Get(':id')
  // async getUserById(@Param('id') id: string) {
  //   const user = await this.usersService.findOneById(id);
  //   if (!user) throw new NotFoundException('User not found');
  //   return user;
  // }
}