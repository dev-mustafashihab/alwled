import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { RolesModule } from './roles/roles.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { EmployeesModule } from './employees/employees.module';
import { PermissionsModule } from './permissions/permissions.module';
import { CategoriesModule } from './categories/categories.module';
import { BrandsModule } from './brands/brands.module';
import { SliderModule } from './slider/slider.module';
import { ProductsModule } from './products/products.module';
import { SpecificationsModule } from './specifications/specifications.module';
import { InventoryModule } from './inventory/inventory.module';
import { CartModule } from './cart/cart.module';
import { CheckoutModule } from './checkout/checkout.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { CustomerVerificationModule } from './customer-verification/customer-verification.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CommonServicesModule } from './common/services/common-services.module';
import { StorageModule } from './common/storage/storage.module';
import { UploadsModule } from './common/storage/uploads.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { JwtAuthGuard, OptionalAuthGuard, RolesGuard, PermissionsGuard } from './common/guards';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: Number(process.env.RATE_GLOBAL_MAX ?? 240) },
    ]),
    DatabaseModule,
    CommonServicesModule,
    StorageModule,
    AuditModule,
    AuthModule,
    RolesModule,
    PermissionsModule,
    UsersModule,
    EmployeesModule,
    // Stage 4 — catalog + inventory
    CategoriesModule,
    BrandsModule,
    SliderModule,
    ProductsModule,
    SpecificationsModule,
    InventoryModule,
    // رفع الصور العام للوحة (تصنيفات · علامات · منتجات · ...)
    UploadsModule,
    // Stage 5 — cart & checkout preview
    CartModule,
    CheckoutModule,
    // Stage 6 — orders & inventory reservation
    OrdersModule,
    // Stage 7 — payments (architecture only, no provider integration)
    PaymentsModule,
    CustomerVerificationModule,
    DashboardModule,
    NotificationsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: OptionalAuthGuard },
  ],
})
export class AppModule {}
