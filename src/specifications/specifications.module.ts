import { Module } from '@nestjs/common';
import { SpecificationsController, ProductSpecificationsController } from './specifications.controller';
import { SpecificationsService } from './specifications.service';

@Module({
  controllers: [SpecificationsController, ProductSpecificationsController],
  providers: [SpecificationsService],
  exports: [SpecificationsService],
})
export class SpecificationsModule {}
