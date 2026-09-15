import {
  Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { InventoryService } from './inventory.service';
import { ListInventoryQueryDto } from './dto/list-inventory.query.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Permissions } from '../common';
import type { ActorAccess } from '../common/utils/permissions.util';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? undefined });
const actorOf = (user: JwtPayload): ActorAccess => ({
  id: user.sub, roles: user.roles ?? [], permissions: user.permissions ?? [],
});

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Permissions({ any: ['inventory.read'] })
  @ApiOperation({
    summary: 'قائمة المخزون (يتطلب inventory.read)',
    description: 'availableQuantity = quantity - reservedQuantity (محسوبة دائماً، غير مخزّنة).',
  })
  list(@Query() query: ListInventoryQueryDto) {
    return this.inventory.list(query);
  }

  @Get(':productId')
  @Permissions({ any: ['inventory.read'] })
  @ApiOperation({ summary: 'مخزون منتج محدّد (يتطلب inventory.read)' })
  getByProduct(@Param('productId', ParseIntPipe) productId: number) {
    return this.inventory.getByProduct(productId);
  }

  @Get(':productId/movements')
  @Permissions({ any: ['inventory.read'] })
  @ApiOperation({ summary: 'حركات المخزون لمنتج (يتطلب inventory.read)' })
  movements(@Param('productId', ParseIntPipe) productId: number, @Query('limit') limit?: string) {
    return this.inventory.movements(productId, limit ? Number(limit) : 50);
  }

  @Patch(':productId')
  @Permissions({ any: ['inventory.update'] })
  @ApiOperation({
    summary: 'تعديل حد التنبيه/الكمية المطلقة (يتطلب inventory.update)',
    description: 'قفل صف (FOR UPDATE) داخل transaction لمنع سباق التحديثات. لا يمكن النزول تحت المحجوز.',
  })
  @ApiResponse({ status: 400, description: 'كمية سالبة أو أقل من المحجوز' })
  update(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: UpdateInventoryDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.inventory.update(productId, dto, actorOf(user), meta(req));
  }

  @Post(':productId/adjust')
  @Permissions({ any: ['inventory.adjust'] })
  @ApiOperation({
    summary: 'تعديل المخزون بحركة مُوقَّعة (يتطلب inventory.adjust)',
    description: 'موجب = إدخال، سالب = إخراج. يُسجّل InventoryMovement + AuditLog. لا يُستخدم لحجز الطلبات.',
  })
  @ApiResponse({ status: 400, description: 'رصيد سالب أو أقل من المحجوز أو كمية = 0' })
  adjust(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: AdjustInventoryDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.inventory.adjust(productId, dto, actorOf(user), meta(req));
  }
}
