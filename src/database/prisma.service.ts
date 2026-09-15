import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private static instance: PrismaService;
  private connected = false;

  constructor() {
    if (PrismaService.instance) {
      return PrismaService.instance;
    }
    super({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });
    PrismaService.instance = this as unknown as PrismaService;
  }

  async onModuleInit() {
    if (!this.connected) {
      await this.$connect();
      this.connected = true;
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.$disconnect();
      this.connected = false;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
