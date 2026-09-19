import { Global, Module } from '@nestjs/common';
import { STORAGE_PROVIDER } from './storage.interface';
import { UrlStorageProvider } from './url-storage.provider';
import { LocalStorageProvider, SLIDER_STORAGE_PROVIDER } from './local-storage.provider';

/**
 * نفس التجريد، مزوّدان:
 * - STORAGE_PROVIDER = URL  (صور المنتجات/المدفوعات — بلا أي تغيير سلوكي)
 * - SLIDER_STORAGE_PROVIDER = local (رفع حقيقي + معالجة WebP لمجلد uploads/slider)
 */
@Global()
@Module({
  providers: [
    { provide: STORAGE_PROVIDER, useClass: UrlStorageProvider },
    { provide: SLIDER_STORAGE_PROVIDER, useClass: LocalStorageProvider },
    LocalStorageProvider,
  ],
  exports: [STORAGE_PROVIDER, SLIDER_STORAGE_PROVIDER, LocalStorageProvider],
})
export class StorageModule {}
