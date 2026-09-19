import { BadRequestException, Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import { StorageProvider, StoredMedia } from './storage.interface';

/**
 * منفذ (token) مستقل للمزوّد المحلي — لا يلمس STORAGE_PROVIDER الحالي،
 * وبذلك تبقى سلوكيات صور المنتجات/المدفوعات (URL) كما هي بلا أي تغيير.
 */
export const SLIDER_STORAGE_PROVIDER = 'SLIDER_STORAGE_PROVIDER';

/** حد الإدخال الإنتاجي (بايت) — لا يُستخدم 400KB كحد رفع. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB
/** حدود الأبعاد — لمنع الصور العبثية/decompression bombs. */
export const MAX_DIMENSION = 6000;
export const MAX_PIXELS = 24_000_000; // 24MP
/** الصيغ المسموحة (أسماء صيغ sharp بعد decode المحتوى الفعلي). */
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
/** إعداد WebP لبانرات المتاجر: جودة عالية دون إتلاف بصري. */
const WEBP_QUALITY = 82;
const WEBP_EFFORT = 4;

export interface UploadInput {
  buffer: Buffer;
  /** اسم العميل — يُستخدم للتسجيل فقط ولا يدخل في أي مسار تخزين. */
  originalname?: string;
  mimetype?: string;
}

export interface ProcessedMedia extends StoredMedia {
  key: string;
  width: number;
  height: number;
  bytes: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceBytes: number;
  sourceFormat: string;
  compressionPct: number;
}

/**
 * مزوّد تخزين محلي حقيقي داخل نفس تجريد StorageProvider.
 *
 * المسار: upload (buffer) → validate (محتوى فعلي + حدود) → decode →
 * auto-orient → strip metadata → WebP مُحسَّن → تحقّق من الناتج →
 * كتابة ذرّية (tmp ثم rename) → إزالة المصدر المؤقّت.
 *
 * لا تُستخدم أسماء ملفات العميل إطلاقًا: الاسم يُولَّد على الخادم:
 *   slider-<uuid>.webp
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly logger = new Logger(LocalStorageProvider.name);
  /** جذر التخزين الفيزيائي (خارج أي مسار يتحكّم به العميل). */
  readonly root: string;
  /** بادئة الرابط العام — لا يكشف أي مسار فيزيائي. */
  readonly publicPrefix = '/uploads/slider/';

  constructor() {
    const configured = process.env.SLIDER_UPLOAD_DIR;
    // الافتراضي خارج /root ليكون قابلاً للقراءة من nginx (بلا تخفيف صلاحيات /root)
    this.root = configured
      ? path.resolve(configured)
      : '/srv/alwled/uploads/slider';
  }

  /**
   * هذا المزوّد يقبل **رفع ملفات** فقط (لا روابط). يُنفَّذ لاستيفاء تجريد StorageProvider
   * دون أي سلوك مضلِّل: أي محاولة تمرير رابط تُرفض بوضوح.
   */
  async put(_url: string): Promise<StoredMedia> {
    throw new BadRequestException('مزوّد السلايدر المحلي يقبل رفع ملفات فقط، لا روابط');
  }

  /** ينشئ جذر التخزين ومجلد العمل المؤقّت عند أول استخدام. */
  private async ensureDirs(): Promise<{ root: string; tmp: string }> {
    const tmp = path.join(this.root, '.tmp');
    await fs.mkdir(tmp, { recursive: true });
    return { root: this.root, tmp };
  }

  /**
   * المعالجة الكاملة. يُرجع بيانات الشريحة الجاهزة + أرقام الضغط للتقرير.
   * لا يحتفظ بالأصل: الناتج النهائي ملف WebP واحد فقط.
   */
  async upload(input: UploadInput): Promise<ProcessedMedia> {
    const { buffer } = input ?? ({} as UploadInput);
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new BadRequestException('ملف الصورة مطلوب');
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        `حجم الملف يتجاوز الحد المسموح (${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB)`,
      );
    }

    // 1) تحقّق من المحتوى الفعلي (لا من الامتداد ولا من MIME المُعلن من العميل).
    let meta: sharp.Metadata;
    try {
      meta = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata();
    } catch {
      throw new BadRequestException('ملف صورة غير صالح أو تالف');
    }
    const format = (meta.format ?? '').toLowerCase();
    if (!ALLOWED_FORMATS.has(format)) {
      throw new BadRequestException(
        `صيغة الصورة غير مدعومة (${format || 'غير معروفة'}). المسموح: JPEG · PNG · WebP`,
      );
    }
    if (!meta.width || !meta.height) throw new BadRequestException('تعذّر قراءة أبعاد الصورة');

    // 2) حدود الأبعاد والمساحة الكلية.
    const srcW = meta.width;
    const srcH = meta.height;
    const pixels = srcW * srcH;
    if (srcW > MAX_DIMENSION || srcH > MAX_DIMENSION || pixels > MAX_PIXELS) {
      throw new BadRequestException(
        `أبعاد الصورة تتجاوز الحد (max ${MAX_DIMENSION}px · max ${MAX_PIXELS / 1e6}MP)`,
      );
    }

    const { tmp } = await this.ensureDirs();
    const key = `slider-${randomUUID()}.webp`;
    const finalPath = path.join(this.root, key);
    const tmpPath = path.join(tmp, `${key}.part`);

    try {
      // 3) auto-orient + strip metadata (sharp يُسقط الميتاداتا افتراضيًا) + WebP.
      const outBuffer = await sharp(buffer, { limitInputPixels: MAX_PIXELS })
        .rotate() // يطبّق اتجاه EXIF ثم يزيله
        .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
        .toBuffer();

      // 4) تحقّق من الناتج قبل تثبيته.
      const outMeta = await sharp(outBuffer).metadata();
      if ((outMeta.format ?? '').toLowerCase() !== 'webp' || !outMeta.width || !outMeta.height) {
        throw new BadRequestException('فشل تحويل الصورة إلى WebP');
      }

      // 5) كتابة ذرّية: temp ثم rename داخل نفس نظام الملفات.
      await fs.writeFile(tmpPath, outBuffer, { flag: 'wx' });
      await fs.rename(tmpPath, finalPath);

      const bytes = outBuffer.length;
      const compressionPct = Math.round((1 - bytes / buffer.length) * 1000) / 10;
      this.logger.log(
        `slider image processed: ${srcW}x${srcH} ${buffer.length}B (${format}) → ` +
          `${outMeta.width}x${outMeta.height} ${bytes}B webp · ضغط ${compressionPct}%`,
      );

      return {
        url: `${this.publicPrefix}${key}`,
        provider: this.name,
        key,
        width: outMeta.width,
        height: outMeta.height,
        bytes,
        sourceWidth: srcW,
        sourceHeight: srcH,
        sourceBytes: buffer.length,
        sourceFormat: format,
        compressionPct,
      };
    } catch (err) {
      // لا نترك أي أثر مؤقّت عند الفشل.
      await fs.rm(tmpPath, { force: true }).catch(() => undefined);
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`slider image processing failed: ${(err as Error).message}`);
      throw new BadRequestException('تعذّرت معالجة الصورة');
    }
  }

  /**
   * حذف آمن: يقبل فقط مفاتيح يملكها هذا المزوّد (slider-<uuid>.webp)
   * ويرفض أي مسار مطلق أو traversal أو مجلد عشوائي.
   */
  async remove(key: string): Promise<void> {
    const raw = (key ?? '').toString().trim();
    if (!raw) return;
    // رفض المسارات المطلقة والاجتياز والبايت الصفري قبل أي تحقّق آخر.
    if (raw.includes('\0') || path.isAbsolute(raw) || raw.includes('..') || /[\\/]/.test(raw)) {
      throw new BadRequestException('مفتاح تخزين غير مسموح');
    }
    if (!/^slider-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(raw)) {
      throw new BadRequestException('مفتاح تخزين غير مسموح');
    }
    const abs = path.resolve(this.root, raw);
    const rel = path.relative(this.root, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new BadRequestException('مسار خارج نطاق التخزين');
    }
    await fs.rm(abs, { force: true });
  }

  /**
   * عقد الاستبدال الآمن (للمرحلة القادمة):
   *   1) رفع الجديد ومعالجته  2) نجاح تحديث القاعدة  3) حذف القديم.
   * لا يُحذف القديم قبل نجاح تحديث القاعدة، وإن فشل التحديث يُنظّف الجديد وحده.
   */
  async replaceSafely(
    input: UploadInput,
    previousKey: string | null | undefined,
    persistNew: (media: ProcessedMedia) => Promise<void>,
  ): Promise<ProcessedMedia> {
    const media = await this.upload(input);
    try {
      await persistNew(media);
    } catch (err) {
      // فشل تحديث القاعدة ⇒ الجديد غير مستخدم ⇒ يُنظَّف بأمان والقديم يبقى سليمًا.
      await this.remove(media.key).catch(() => undefined);
      throw err;
    }
    if (previousKey && previousKey !== media.key) {
      await this.remove(previousKey).catch((e) =>
        this.logger.warn(`تعذّر حذف الملف السابق ${previousKey}: ${(e as Error).message}`),
      );
    }
    return media;
  }

  /** للتقارير/الفحص: حجم مجلد التخزين وعدد الملفات المؤقّتة المتروكة. */
  async stats(): Promise<{ files: number; bytes: number; tempLeftovers: number }> {
    const { root, tmp } = await this.ensureDirs();
    let files = 0;
    let bytes = 0;
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const st = await fs.stat(path.join(root, entry.name));
      files += 1;
      bytes += st.size;
    }
    const tempLeftovers = (await fs.readdir(tmp)).length;
    return { files, bytes, tempLeftovers };
  }
}
