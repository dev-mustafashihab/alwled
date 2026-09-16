import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { AnalyticsController } from './analytics.controller';
import { DashboardService } from './dashboard.service';
import { AnalyticsService } from './analytics.service';

/**
 * Stage 10 — Dashboard & Analytics.
 * Read-only module: no provider here can write to a domain table.
 */
@Module({
  controllers: [DashboardController, AnalyticsController],
  providers: [DashboardService, AnalyticsService],
  exports: [DashboardService, AnalyticsService],
})
export class DashboardModule {}
