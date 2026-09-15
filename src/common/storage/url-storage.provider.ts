import { BadRequestException, Injectable } from '@nestjs/common';
import { StorageProvider, StoredMedia } from './storage.interface';

/**
 * Default provider: media already exists somewhere reachable by URL.
 * Swap this class for S3/Cloudinary later (see STORAGE_PROVIDER token) and the
 * products/categories/brands modules stay untouched.
 */
@Injectable()
export class UrlStorageProvider implements StorageProvider {
  readonly name = 'url';

  async put(url: string): Promise<StoredMedia> {
    const value = (url ?? '').trim();
    if (!value) throw new BadRequestException('رابط الوسائط مطلوب');
    if (!/^(https?:\/\/|\/)/i.test(value)) {
      throw new BadRequestException('رابط الوسائط يجب أن يبدأ بـhttp(s):// أو /');
    }
    if (value.length > 512) throw new BadRequestException('رابط الوسائط طويل جداً');
    return { url: value, provider: this.name };
  }

  async remove(_key: string): Promise<void> {
    // URL-based storage owns no bytes — nothing to delete.
  }
}
