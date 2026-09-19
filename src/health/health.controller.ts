import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** الفحص القائم (كما هو — لا تغيير في العقد). */
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

  /**
   * Liveness: هل عملية التطبيق حيّة؟ لا يلمس قاعدة البيانات حتى لا يُعاد تشغيل الحاوية
   * بسبب عطل في الاعتماديات الخارجية.
   */
  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe (process only, no dependencies)' })
  @ApiResponse({ status: 200, description: 'العملية تعمل' })
  live() {
    return {
      success: true,
      message: 'OK',
      data: {
        status: 'live',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Readiness: هل التطبيق قادر على خدمة الطلبات (قاعدة البيانات متاحة)؟
   * 200 عند الجاهزية، و503 عند تعذّر الوصول لقاعدة البيانات. لا تُكشف عناوين أو أسرار أو أثر خطأ.
   */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (database reachable)' })
  @ApiResponse({ status: 200, description: 'جاهز' })
  @ApiResponse({ status: 503, description: 'قاعدة البيانات غير متاحة' })
  async ready() {
    let databaseUp = false;
    try {
      databaseUp = await this.prisma.isHealthy();
    } catch {
      databaseUp = false;
    }
    if (!databaseUp) {
      throw new ServiceUnavailableException('الخدمة غير جاهزة: قاعدة البيانات غير متاحة');
    }
    return {
      success: true,
      message: 'OK',
      data: {
        status: 'ready',
        database: 'up',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
