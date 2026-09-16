import {
  Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { NotificationsService } from './notifications.service';
import {
  ListNotificationsQueryDto, ListPreferencesQueryDto, UpdatePreferenceDto,
} from './dto/notifications.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '../common';
import { RATE_LIMITS } from '../common/constants';

/**
 * Customer notification inbox. The user id ALWAYS comes from the access token:
 * there is no endpoint that lets a client create a notification or choose a
 * recipient, and no route can read another user's notification.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'صندوق إشعارات المستخدم الحالي',
    description:
      'يعيد إشعارات المستخدم فقط. فلاتر: type/channel/read/from/to (from شامل · to غير شامل) · ' +
      'حد أقصى للصفحة 50 · ترتيب بـcreatedAt فقط.',
  })
  @ApiResponse({ status: 200, description: 'items + meta (page/limit/total/unread)' })
  @ApiResponse({ status: 401, description: 'يتطلب تسجيل دخول' })
  list(@CurrentUser() user: JwtPayload, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.listMine(user.sub, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'عدد الإشعارات غير المقروءة (COUNT في قاعدة البيانات)' })
  @ApiResponse({ status: 200, description: '{ count }' })
  async unreadCount(@CurrentUser() user: JwtPayload) {
    return this.notifications.unreadCount(user.sub);
  }

  @Get('preferences')
  @ApiOperation({
    summary: 'تفضيلات الإشعارات للمستخدم الحالي',
    description:
      'الإشعارات المعاملاتية (الطلب/الدفع/التحقق) **إلزامية** وmandatory=true. ' +
      'غير ذلك افتراضه مُفعَّل عند غياب السجل (default = enabled).',
  })
  preferences(@CurrentUser() user: JwtPayload, @Query() query: ListPreferencesQueryDto) {
    return this.notifications.listPreferences(user.sub, query);
  }

  @Patch('preferences')
  @ApiOperation({
    summary: 'تعديل تفضيل (الأنواع القابلة للتعطيل فقط)',
    description: 'userId من التوكن. محاولة تعطيل نوع إلزامي ⇒ 400.',
  })
  @ApiResponse({ status: 400, description: 'نوع إلزامي أو حقول غير مسموحة' })
  updatePreference(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePreferenceDto) {
    return this.notifications.updatePreference(user.sub, dto);
  }

  @Post('read-all')
  @HttpCode(200)
  @Throttle({ default: { limit: RATE_LIMITS.notifications.max, ttl: RATE_LIMITS.notifications.window * 1000 } })
  @ApiOperation({
    summary: 'تعليم كل إشعاراتي كمقروءة',
    description: 'تحديث محدود بـuserId من التوكن + readAt IS NULL فقط — لا يمسّ مستخدماً آخر.',
  })
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notifications.markAllRead(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'إشعار واحد يخص المستخدم الحالي (غير ذلك 404)' })
  @ApiResponse({ status: 404, description: 'غير موجود أو يخص مستخدماً آخر' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.notifications.findMine(id, user.sub);
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'تعليم إشعار كمقروء (Idempotent)',
    description: 'يعيد changed=false إذا كان مقروءاً مسبقاً — بلا أي أثر مكرر.',
  })
  @ApiResponse({ status: 404, description: 'غير موجود أو يخص مستخدماً آخر' })
  markRead(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() _req: Request) {
    return this.notifications.markRead(id, user.sub);
  }
}
