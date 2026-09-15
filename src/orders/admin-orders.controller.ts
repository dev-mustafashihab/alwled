import {
  Body, Controller, Get, Param, ParseIntPipe, Patch, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { AdminListOrdersQueryDto } from './dto/admin-list-orders.query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Permissions } from '../common';
import { requestMeta } from '../common/types/request-meta';

/**
 * Staff order management. Separate routes so `GET /orders` keeps its customer
 * meaning, and every route is gated by the existing permission system.
 */
@ApiTags('admin-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @Permissions({ any: ['orders.read'] })
  @ApiOperation({
    summary: 'كل الطلبات (يتطلب orders.read)',
    description: 'فلاتر: page, limit, status, orderNumber, userId, createdFrom, createdTo. لا استعلام بلا صفحات.',
  })
  @ApiResponse({ status: 403, description: 'بدون صلاحية orders.read' })
  list(@Query() query: AdminListOrdersQueryDto) {
    return this.orders.adminList(query);
  }

  @Get(':id')
  @Permissions({ any: ['orders.read'] })
  @ApiOperation({ summary: 'تفاصيل أي طلب (يتطلب orders.read)' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.orders.findOne(id, { id: user.sub, isStaff: true });
  }

  @Patch(':id/status')
  @Permissions({ any: ['orders.update'] })
  @ApiOperation({
    summary: 'تحديث حالة الطلب (يتطلب orders.update)',
    description:
      'الانتقالات المسموحة: PENDING→CONFIRMED، PENDING→CANCELLED، CONFIRMED→CANCELLED. ' +
      'CANCELLED نهائية. إرسال CANCELLED يمر عبر نفس مسار الإلغاء (تحرير الحجز + RELEASE). ' +
      'لا يمكن للعميل تغيير الحالة عبر هذه المسارات.',
  })
  @ApiResponse({ status: 403, description: 'بدون صلاحية orders.update' })
  @ApiResponse({ status: 409, description: 'انتقال غير مسموح أو نفس الحالة' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.orders.updateStatus(id, dto, { id: user.sub, isStaff: true }, requestMeta(req));
  }
}
