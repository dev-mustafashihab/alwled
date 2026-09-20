import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';

/**
 * رفع الصور العام للوحة — يستخدم LocalStorageProvider المصدَّر من StorageModule (Global).
 */
@Module({
  controllers: [UploadsController],
})
export class UploadsModule {}
