import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SliderService, RequestMeta } from './slider.service';
import { CreateSlideDto } from './dto/create-slide.dto';
import { UpdateSlideDto } from './dto/update-slide.dto';
import { ReorderSlidesDto } from './dto/reorder-slides.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Permissions, Public } from '../common';
import { LocalStorageProvider, MAX_UPLOAD_BYTES, ProcessedMedia } from '../common/storage/local-storage.provider';

/** شكل الملف المرفوع (بلا الحاجة إلى @types/multer). */
interface UploadedImage { buffer: Buffer; originalname?: string; mimetype?: string; size?: number }

const meta = (req: Request, user?: JwtPayload): RequestMeta => ({
  ip: req.ip, userAgent: req.headers['user-agent'] ?? undefined, actorId: user?.sub ?? null,
});
/** يحوّل خطأ المزوّد إلى استجابة نظيفة بلا مسارات فيزيائية. */
async function processOrFail(storage: LocalStorageProvider, file?: UploadedImage | null): Promise<ProcessedMedia | null> {
  if (!file) return null;
  return storage.upload({ buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype });
}

@ApiTags('slider')
@Controller('slider')
export class SliderController {
  constructor(private readonly slider: SliderService, private readonly storage: LocalStorageProvider) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'شرائح الواجهة الرئيسية (عام) — المفعّلة فقط بترتيب sortOrder ثم id' })
  listPublic() {
    return this.slider.listPublic();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Permissions({ any: ['slider.read'] })
  @Get('admin')
  @ApiOperation({ summary: 'كل الشرائح (إداري) — مفعّلة ومعطّلة' })
  listAdmin() {
    return this.slider.listAdmin();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Permissions({ any: ['slider.read'] })
  @Get('admin/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.slider.findOneAdmin(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Permissions({ any: ['slider.create'] })
  @Post('admin')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: {
    desktop: { type: 'string', format: 'binary' }, mobile: { type: 'string', format: 'binary' },
    altText: { type: 'string' }, linkUrl: { type: 'string' }, title: { type: 'string' },
    subtitle: { type: 'string' }, ctaLabel: { type: 'string' }, isEnabled: { type: 'boolean' }, sortOrder: { type: 'integer' },
  }, required: ['desktop'] } })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'desktop', maxCount: 1 }, { name: 'mobile', maxCount: 1 }],
    { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiOperation({ summary: 'إضافة شريحة (إداري) — سطح المكتب إلزامي · الجوال اختياري' })
  async create(@Body() dto: CreateSlideDto,
               @UploadedFiles() files: { desktop?: UploadedImage[]; mobile?: UploadedImage[] },
               @Req() req: Request, @CurrentUser() user?: JwtPayload) {
    const desktopFile = files?.desktop?.[0];
    if (!desktopFile) throw new BadRequestException('صورة سطح المكتب مطلوبة');
    let desktop: ProcessedMedia | null = null;
    let mobile: ProcessedMedia | null = null;
    try {
      desktop = await processOrFail(this.storage, desktopFile);
      mobile = await processOrFail(this.storage, files?.mobile?.[0] ?? null);
      return await this.slider.create(dto, desktop!, mobile, meta(req, user));
    } catch (err) {
      if (desktop) await this.storage.remove(desktop.key).catch(() => undefined);
      if (mobile) await this.storage.remove(mobile.key).catch(() => undefined);
      throw err;
    }
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Permissions({ any: ['slider.create'] })
  @Post('admin/:id/mobile')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'mobile', maxCount: 1 }], { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiOperation({ summary: 'إضافة/استبدال صورة الجوال (إداري)' })
  async uploadMobile(@Param('id', ParseIntPipe) id: number,
                     @UploadedFiles() files: { mobile?: UploadedImage[] },
                     @Req() req: Request, @CurrentUser() user?: JwtPayload) {
    const processed = await processOrFail(this.storage, files?.mobile?.[0] ?? null);
    if (!processed) throw new BadRequestException('صورة الجوال مطلوبة');
    try {
      return await this.slider.update(id, { mobileMode: 'replace' } as UpdateSlideDto, null, processed, meta(req, user));
    } catch (err) {
      await this.storage.remove(processed.key).catch(() => undefined);
      throw err;
    }
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Permissions({ any: ['slider.update'] })
  @Patch('admin/reorder')
  @ApiOperation({ summary: 'ترتيب الشرائح دفعة واحدة (إداري) — معاملة واحدة' })
  reorder(@Body() dto: ReorderSlidesDto, @Req() req: Request, @CurrentUser() user?: JwtPayload) {
    return this.slider.reorder(dto, meta(req, user));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Permissions({ any: ['slider.update'] })
  @Patch('admin/:id')
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'desktop', maxCount: 1 }, { name: 'mobile', maxCount: 1 }],
    { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiOperation({ summary: 'تعديل شريحة (إداري) — بلا صورة جديدة تُحفظ الحالية · mobileMode: keep|replace|remove' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSlideDto,
               @UploadedFiles() files: { desktop?: UploadedImage[]; mobile?: UploadedImage[] },
               @Req() req: Request, @CurrentUser() user?: JwtPayload) {
    let desktop: ProcessedMedia | null = null;
    let mobile: ProcessedMedia | null = null;
    try {
      desktop = await processOrFail(this.storage, files?.desktop?.[0] ?? null);
      mobile = await processOrFail(this.storage, files?.mobile?.[0] ?? null);
      return await this.slider.update(id, dto, desktop, mobile, meta(req, user));
    } catch (err) {
      if (desktop) await this.storage.remove(desktop.key).catch(() => undefined);
      if (mobile) await this.storage.remove(mobile.key).catch(() => undefined);
      throw err;
    }
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Permissions({ any: ['slider.delete'] })
  @Delete('admin/:id')
  @ApiOperation({ summary: 'حذف شريحة (إداري) — حذف القاعدة ثم تنظيف الأصول المُدارة' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request, @CurrentUser() user?: JwtPayload) {
    return this.slider.remove(id, meta(req, user));
  }
}
