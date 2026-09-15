import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditAction } from './audit.actions';
import { ListAuditQueryDto } from './dto/list-audit.query.dto';

export interface AuditInput {
  action: AuditAction | string;
  actorId?: string | null;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export interface PaginatedAudit {
  items: unknown[];
  meta: { page: number; limit: number; total: number; totalPages: number };
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

  async list(query: ListAuditQueryDto): Promise<PaginatedAudit> {
    const { page, limit, action, actorUserId, targetUserId, from, to } = query;
    const where: Prisma.AuditLogWhereInput = {};
    if (action) where.action = action;
    if (actorUserId) where.actorId = actorUserId;
    if (targetUserId) where.OR = [{ entityId: targetUserId }, { actorId: targetUserId }];
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, action: true, entity: true, entityId: true,
          metadata: true, ip: true, userAgent: true, createdAt: true,
          actorId: true,
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
}
