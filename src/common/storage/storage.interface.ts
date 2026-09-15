/**
 * Storage abstraction for product/category/brand media.
 * Today only URL-based storage is implemented; S3 / Cloudinary / local uploads
 * can be added later by providing another implementation — no API change needed.
 */
export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface StoredMedia {
  url: string;
  provider: string;
  key?: string;
}

export interface StorageProvider {
  readonly name: string;
  /** Validates/normalizes an already-hosted media URL. */
  put(url: string): Promise<StoredMedia>;
  /** Hook for future real uploads (multipart, S3, ...). */
  upload?(file: unknown, options?: Record<string, unknown>): Promise<StoredMedia>;
  remove?(key: string): Promise<void>;
}
