import {
  BadRequestException, Controller, Injectable, Logger, Post, Query, UploadedFile,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { JwtAuthGuard, Permissions } from '../../common';
import { MAX_UPLOAD_BYTES, MAX_DIMENSION, MAX_PIXELS } from './local-storage.provider';

/**
 * رفع صور عام للوحة الإدارة — لكل الحقول التي كانت تأخذ «رابط صورة» يدويًا
 * (تصنيفات · علامات · صور المنتجات · ...).
 * نفس عقد السلايدر: تحقّق محتوى فعلي → WebP مُحسَّن → كتابة ذرّية.
 * الاسم على الخادم: img-<uuid>.webp — بلا أي مسار من العميل.
 * «ضبط المقاس المناسب»: معاينة بحد أقصى منطقي (MAX_EDGE) مع الحفاظ على النسبة،
 * والصورة الأصلية تُخزّن مضغوطة WebP — العرض النهائي يضبطه CSS من الرابط نفسه.
 */
const IMAGES_ROOT = process.env.IMAGES_UPLOAD_DIR || '/srv/alwled/uploads/images';
const PUBLIC_PREFIX = '/uploads/images/';
const MAX_EDGE = 2048; // أطول ضلع بعد الضبط — مناسب لكل استخدامات اللوحة (بطاقات/شرائح/بانرات)
const ALLOWED = new Set(['jpeg', 'png', 'webp']);

@ApiTags('uploads')
@Injectable()
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  @Post('image')
  @ApiBearerAuth()
  @Permissions({ any: ['categories.create', 'categories.update', 'brands.create', 'brands.update', 'products.create', 'products.update', 'slider.create', 'slider.update', '*'] })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async uploadImage(@UploadedFile() file?: { buffer: Buffer; originalname?: string; mimetype?: string; size?: number }) {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException('ملف الصورة مطلوب');
    }
    let meta: sharp.Metadata;
    try {
      meta = await sharp(file.buffer, { limitInputPixels: MAX_PIXELS }).metadata();
    } catch {
      throw new BadRequestException('ملف صورة غير صالح أو تالف');
    }
    const format = (meta.format ?? '').toLowerCase();
    if (!ALLOWED.has(format)) {
      throw new BadRequestException(`صيغة غير مدعومة (${format || 'غير معروفة'}). المسموح: JPEG · PNG · WebP`);
    }
    if (!meta.width || !meta.height) throw new BadRequestException('تعذّر قراءة أبعاد الصورة');
    if (meta.width > MAX_DIMENSION * 3 || meta.height > MAX_DIMENSION * 3) {
      throw new BadRequestException(`أبعاد الصورة كبيرة جدًا (الحد ${MAX_DIMENSION * 3}px)`);
    }

    // ضبط المقاس: إن كانت أطول من MAX_EDGE نُصغّر مع الحفاظ على النسبة (دون تكبير أصغر).
    const needsResize = meta.width > MAX_EDGE || meta.height > MAX_EDGE;
    let pipeline = sharp(file.buffer, { limitInputPixels: MAX_PIXELS }).rotate();
    if (needsResize) {
      pipeline = pipeline.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
    }
    const outBuffer = await pipeline.webp({ quality: 82, effort: 4 }).toBuffer();
    const outMeta = await sharp(outBuffer).metadata();
    if ((outMeta.format ?? '').toLowerCase() !== 'webp' || !outMeta.width || !outMeta.height) {
      throw new BadRequestException('فشل تحويل الصورة إلى WebP');
    }

    await fs.mkdir(IMAGES_ROOT, { recursive: true });
    const key = `img-${randomUUID()}.webp`;
    const finalPath = path.join(IMAGES_ROOT, key);
    const tmpPath = path.join(IMAGES_ROOT, `${key}.part`);
    await fs.writeFile(tmpPath, outBuffer, { flag: 'wx' });
    await fs.rename(tmpPath, finalPath);

    this.logger.log(
      `image uploaded: ${meta.width}x${meta.height} ${file.buffer.length}B (${format}) → ` +
        `${outMeta.width}x${outMeta.height} ${outBuffer.length}B webp`,
    );

    return {
      url: `${PUBLIC_PREFIX}${key}`,
      key,
      width: outMeta.width,
      height: outMeta.height,
      bytes: outBuffer.length,
      sourceWidth: meta.width,
      sourceHeight: meta.height,
      sourceBytes: file.buffer.length,
    };
  }
}
