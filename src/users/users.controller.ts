import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, Permissions } from '../common';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  me(@CurrentUser('sub') sub: string) {
    return this.users.findById(sub);
  }

  @Get()
  @Permissions({ any: ['employees.read'] })
  @ApiOperation({ summary: 'List staff users (admin/employee) — architecture placeholder' })
  list() {
    return this.users.listStaff();
  }
}
