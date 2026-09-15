import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async grouped() {
    const all = await this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
    const groups: Record<string, typeof all> = {};
    all.forEach((p) => {
      (groups[p.group] ??= []).push(p);
    });
    return groups;
  }
}
