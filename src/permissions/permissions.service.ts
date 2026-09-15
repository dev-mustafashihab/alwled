import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface PermissionView {
  id: number;
  key: string;
  name: string;
  group: string;
}

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Grouped by module with counts — single query, no N+1. */
  async grouped() {
    const all = await this.prisma.permission.findMany({
      where: { group: { notIn: ['system', '*'] } }, // '*' is internal and not assignable from the UI
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
      select: { id: true, key: true, name: true, group: true },
    });

    const groups: Record<string, PermissionView[]> = {};
    all.forEach((p) => {
      (groups[p.group] ??= []).push(p);
    });

    return {
      total: all.length,
      groups: Object.entries(groups).map(([module, permissions]) => ({
        module,
        count: permissions.length,
        permissions,
      })),
      flat: all,
    };
  }

  findAll() {
    return this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
  }
}
