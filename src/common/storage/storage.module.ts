import { Global, Module } from '@nestjs/common';
import { STORAGE_PROVIDER } from './storage.interface';
import { UrlStorageProvider } from './url-storage.provider';

@Global()
@Module({
  providers: [{ provide: STORAGE_PROVIDER, useClass: UrlStorageProvider }],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
