import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditAction } from './audit.actions';

export interface AuditInput {
  action: AuditAction | string;
  actorId?: string | null;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/** Never log passwords, tokens or secrets — only identifiers and flags. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: input.action,
          actorId: input.actorId ?? null,
          entity: input.entity ?? null,
          entityId: input.entityId ?? null,
          metadata: (input.metadata ?? {}) as never,
          ip: input.ip ?? null,
          userAgent: input.userAgent ? input.userAgent.slice(0, 255) : null,
        },
      });
    } catch (error) {
      // Audit must never break the business flow.
      this.logger.warn(`audit failed for ${input.action}: ${(error as Error).message}`);
    }
  }

  async list(limit = 50, actorId?: string) {
    return this.prisma.auditLog.findMany({
      where: actorId ? { actorId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: {
        id: true, action: true, entity: true, entityId: true,
        metadata: true, ip: true, createdAt: true, actorId: true,
      },
    });
  }
}
