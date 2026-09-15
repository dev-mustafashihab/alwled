import { Controller, Get } from '@nestjs/common';
import { Public } from '../common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Server + database healthcheck' })
  async check() {
    const db = await this.prisma.isHealthy();
    return {
      success: true,
      message: 'OK',
      data: {
        server: 'up',
        database: db ? 'up' : 'down',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
