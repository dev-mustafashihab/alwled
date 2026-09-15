import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const STAFF_ROLES = ['OWNER', 'ADMIN', 'EMPLOYEE'];

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        phone: true, status: true, isVerified: true, createdAt: true,
        roles: { include: { role: { select: { name: true } } } },
      },
    });
  }

  async listStaff() {
    return this.prisma.user.findMany({
      where: { roles: { some: { role: { name: { in: STAFF_ROLES as never[] } } } } },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        phone: true, status: true, isVerified: true, createdAt: true,
        roles: { include: { role: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
