import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import {
  InventoryAnalyticsQueryDto, OrdersAnalyticsQueryDto, PaymentReviewQueryDto,
  PaymentsAnalyticsQueryDto, RecentOrdersQueryDto, RecentPaymentsQueryDto,
  VerificationsAnalyticsQueryDto,
} from './dto/dashboard.dto';
import { JwtAuthGuard, Permissions } from '../common';

/**
 * Admin dashboard — READ ONLY by design.
 *
 * There is no POST/PUT/PATCH/DELETE anywhere in this module: every route is a GET
 * and the service only aggregates. A JWT is mandatory and `dashboard.read` decides
 * access (no role-name checks).
 */
@ApiTags('admin-dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Permissions({ any: ['dashboard.read'] })
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'نظرة عامة (يتطلب dashboard.read)',
    description:
      'لقطة كلية: المستخدمون/العملاء/الموظفون، المنتجات، المخزون، الطلبات، الدفعات، التحقق. ' +
      'كل الأرقام من تجميعات قاعدة البيانات مباشرة (COUNT/GROUP BY/SUM).',
  })
  @ApiResponse({ status: 200, description: 'مؤشرات الأعمال' })
  @ApiResponse({ status: 401, description: 'يتطلب تسجيل دخول' })
  @ApiResponse({ status: 403, description: 'بدون صلاحية dashboard.read' })
  overview() {
    return this.dashboard.overview();
  }

  @Get('catalog')
  @ApiOperation({
    summary: 'تحليلات الكتالوگ (يتطلب dashboard.read)',
    description: 'منتجات نشطة/غير نشطة، صور، وأعلى التصنيفات والعلامات بعدد المنتجات.',
  })
  catalog() {
    return this.dashboard.catalogAnalytics();
  }

  @Get('orders')
  @ApiOperation({
    summary: 'تحليلات الطلبات (يتطلب dashboard.read)',
    description:
      'عدد الطلبات حسب الحالة + قيمة الطلبات والمتوسط/الأدنى/الأعلى خلال مدى زمني. ' +
      'from شامل و to غير شامل، افتراضياً آخر 30 يوماً (UTC).',
  })
  orders(@Query() query: OrdersAnalyticsQueryDto) {
    return this.dashboard.ordersAnalytics(query);
  }

  @Get('payments')
  @ApiOperation({
    summary: 'تحليلات الدفعات (يتطلب dashboard.read)',
    description:
      'الدفعات حسب الحالة والمبالغ. **SUCCEEDED فقط** يُحسب مبلغاً محصَّلاً؛ ' +
      'PENDING/PENDING_REVIEW/PROCESSING مبالغ معلّقة وليست مبيعات. ' +
      'manual Sham Cash تُعرض كتأكيد موظف يدوي (Stage 8) لا كتحقق مزوّد.',
  })
  payments(@Query() query: PaymentsAnalyticsQueryDto) {
    return this.dashboard.paymentsAnalytics(query);
  }

  @Get('inventory')
  @ApiOperation({
    summary: 'تحليلات المخزون (يتطلب dashboard.read)',
    description:
      'الكميات والمحجوز والمتاح حيث available = quantity - reservedQuantity، ' +
      'والمنخفض حسب lowStockThreshold الخاص بكل سجل، والمنتهي عند available <= 0.',
  })
  inventory(@Query() query: InventoryAnalyticsQueryDto) {
    return this.dashboard.inventoryAnalytics(query);
  }

  @Get('verifications')
  @ApiOperation({
    summary: 'تحليلات التحقق (يتطلب dashboard.read)',
    description: 'أعداد طلبات التحقق حسب الحالة خلال مدى زمني (inReview = طابور المراجعة).',
  })
  verifications(@Query() query: VerificationsAnalyticsQueryDto) {
    return this.dashboard.verificationsAnalytics(query);
  }

  @Get('recent-orders')
  @ApiOperation({
    summary: 'أحدث الطلبات (يتطلب dashboard.read)',
    description: 'قائمة محدودة (افتراضي 10، الأقصى 50) مع ترتيب من قائمة مسموحة فقط.',
  })
  recentOrders(@Query() query: RecentOrdersQueryDto) {
    return this.dashboard.recentOrders(query);
  }

  @Get('recent-payments')
  @ApiOperation({
    summary: 'أحدث الدفعات (يتطلب dashboard.read)',
    description: 'قائمة محدودة بدون أي بيانات إثبات أو أسرار (لا proofUrl ولا معرّفات مزوّد).',
  })
  recentPayments(@Query() query: RecentPaymentsQueryDto) {
    return this.dashboard.recentPayments(query);
  }

  @Get('payment-review')
  @ApiOperation({
    summary: 'طابور مراجعة دفعات شام كاش (يتطلب dashboard.read)',
    description:
      'PENDING_REVIEW فقط. يعرض بيانات المراجعة اللازمة (رقم العملية، المبلغ، وقت الإرسال) ' +
      'ووجود الإثبات دون كشف مكان تخزينه.',
  })
  paymentReview(@Query() query: PaymentReviewQueryDto) {
    return this.dashboard.paymentReview(query);
  }
}
